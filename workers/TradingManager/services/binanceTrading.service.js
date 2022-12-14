const Binance = require("node-binance-api");
const { toSignedLittleBuffer } = require("telegram/Helpers");
const TradingHistoryModel = require("../../../models/tradeHistory.model");
const { logger } = require("../../../util/logger");

class BinanceTradingService {
  #options;
  #binance;
  #orders = [];
  #closingOrders = [];
  #tasksQueue = [];
  #taskProcessingStatus = 0; // 0 - waiting task / 1 - processing task
  pairsData = [];
  precisions = {};

  constructor(key, secret) {
    this.#options = {
      key,
      secret,
    };

    this.#binance = new Binance().options({
      APIKEY: key,
      APISECRET: secret,
      useServerTime: true,
      recvWindow: 60000,
      verbose: true,
      log: (log) => {
        console.log(log);
      },
    });

    this.openSocket();
  }

  openOrder(signalData, binanceSettings, userId) {
    return new Promise(async (resolve, reject) => {
      //Задаем плечо
      await this.#binance.futuresLeverage(
        signalData.symbol,
        binanceSettings.leverage
      );

      //Задаем вид маржи
      await this.#binance.futuresMarginType(signalData.symbol, 'ISOLATED');

      const price = (await this.#binance.futuresPrices())[signalData.symbol];

      const qty =
        (binanceSettings.positionSize * binanceSettings.leverage) / price;

      //Открытие основной позиции
      const mainOrder = [
        {
          symbol: signalData.symbol,
          side: signalData.side,
          type: "MARKET",
          quantity: String(await this.filterLotSize(signalData.symbol, qty)),
          positionSide: signalData.positionSide,
        },
      ];

      console.log(mainOrder);

      const mainOrderResp = await this.#binance.futuresMultipleOrders(
        mainOrder
      );
      const mainOrderResponse = mainOrderResp[0];

      mainOrderResponse.price = String(
        await this.filterPrice(signalData.symbol, Number(price))
      );

      console.log(mainOrderResp);

      if (!mainOrderResponse.orderId) {
        console.log(mainOrderResponse);
        // logger.error(binanceMainLongResponse);
        return resolve({
          type: "ERROR",
          message: "Ошибка открытия основного ордера",
        });
      }

      //Открытие ТП и СЛ
      const orders = [];

      //Тейк-профит
      let accumulatedTpVolume = 0;
      let slPriceOfBreakevenTp;
      for (let i = 0; i < binanceSettings.tps.length; i++) {
        const offsetPrice =
          (Number(price) * Number(binanceSettings.tps[i].offset)) / 100;
        const tpPrice =
          signalData.positionSide === "LONG"
            ? Number(price) + offsetPrice
            : Number(price) - offsetPrice;

        //Для последнего ТП
        if (i >= binanceSettings.tps.length - 1) {
          const order = {
            symbol: signalData.symbol,
            side: signalData.side === "BUY" ? "SELL" : "BUY",
            type: "TAKE_PROFIT_MARKET",
            stopPrice: String(
              await this.filterPrice(signalData.symbol, Number(tpPrice))
            ),
            quantity: String(
              await this.filterLotSize(
                signalData.symbol,
                Number(mainOrderResponse.origQty) - accumulatedTpVolume
              )
            ),
            positionSide: signalData.positionSide,
          };

          //Определяем перенос БУ
          if (binanceSettings.tps[i].breakeven) {
            slPriceOfBreakevenTp = order.stopPrice;
          }

          orders.push(order);
          break;
        }

        //Для первых ТП исключая последний
        const tpQty =
          (Number(mainOrderResponse.origQty) * binanceSettings.tps[i].amount) /
          100;
        const validTpQty = await this.filterLotSize(signalData.symbol, tpQty);

        accumulatedTpVolume += validTpQty;

        const order = {
          symbol: signalData.symbol,
          side: signalData.side === "BUY" ? "SELL" : "BUY",
          type: "TAKE_PROFIT_MARKET",
          stopPrice: String(
            await this.filterPrice(signalData.symbol, Number(tpPrice))
          ),
          quantity: String(validTpQty),
          positionSide: signalData.positionSide,
        };

        //Определяем перенос БУ
        if (binanceSettings.tps[i].breakeven) {
          slPriceOfBreakevenTp = order.stopPrice;
        }

        orders.push(order);
      }

      //Cтоп-лосс
      switch (binanceSettings.sl.type) {
        case "USUAL":
          const offsetPrice =
            (Number(price) * Number(binanceSettings.sl.offset)) / 100;
          const slPrice =
            signalData.positionSide === "LONG"
              ? Number(price) - offsetPrice
              : Number(price) + offsetPrice;

          orders.push({
            symbol: signalData.symbol,
            side: signalData.side === "BUY" ? "SELL" : "BUY",
            type: "STOP_MARKET",
            stopPrice: String(
              await this.filterPrice(signalData.symbol, Number(slPrice))
            ),
            quantity: String(mainOrderResponse.origQty),
            positionSide: signalData.positionSide,
          });
          break;

        case "TRAILING":
          const slQty =
            (Number(mainOrderResponse.origQty) * binanceSettings.sl.amount) /
            100;
          const validSlQty = await this.filterLotSize(signalData.symbol, slQty);

          const trailingOrder = {
            symbol: signalData.symbol,
            side: signalData.side === "BUY" ? "SELL" : "BUY",
            type: "TRAILING_STOP_MARKET",
            quantity: String(validSlQty),
            callbackRate: String(binanceSettings.sl.offset),
            positionSide: signalData.positionSide,
          };

          orders.push(trailingOrder);
          break;

        default:
          break;
      }

      console.log(orders);
      logger.info(orders);

      const ordersResponse = await this.placeMultipleOrders(orders);

      //Добавляем БУ свойство в ответ для индентификации в будущем переноса стоп-лосса
      if (slPriceOfBreakevenTp) {
        for (let i = 0; i < ordersResponse.length; i++) {
          if (ordersResponse[i].stopPrice == slPriceOfBreakevenTp) {
            ordersResponse[i].breakeven = true;
          }
        }
      }

      console.log(ordersResponse);

      //Проверка ошибки при выставлении оредров
      for (const binanceResponse of ordersResponse) {
        if (!binanceResponse.orderId) {
          logger.error(binanceResponse);
          console.log("Canceling all orders due to one of the orders error!");

          //Закрытие позиции
          const mainCloseResponse = (
            await this.#binance.futuresMultipleOrders([
              {
                symbol: signalData.symbol,
                side: signalData.side === "BUY" ? "SELL" : "BUY",
                type: "MARKET",
                quantity: mainOrderResponse.origQty,
                positionSide: signalData.positionSide,
              },
            ])
          )[0];

          //Закрытие ордеров
          for (let i = 0; i < ordersResponse.length; i++) {
            const response = ordersResponse[i];

            const cancelResponse = await this.#binance.futuresCancel(
              signalData.symbol,
              {
                orderId: response.orderId,
              }
            );
          }

          return resolve({
            type: "ERROR",
            message: "Ошибка выставления ТП или СЛ",
          });
        }
      }

      const tpOrders = ordersResponse.filter(
        (data) => data.origType === "TAKE_PROFIT_MARKET"
      );
      const slOrder = ordersResponse.find(
        (data) =>
          data.origType === "TRAILING_STOP_MARKET" ||
          data.origType === "STOP_MARKET"
      );

      const response = {
        symbol: signalData.symbol,
        channelName: signalData.channelName,
        mainOrder: mainOrderResponse,
        subOrders: {
          tps: tpOrders,
          sl: slOrder,
        },
        statistics: {
          user: userId,
          openPrice: mainOrderResponse.price,
          side: mainOrderResponse.positionSide,
          pair: mainOrderResponse.symbol,
          profit: 0,
          commission: 0,
        },
        binanceSettings,
      };

      this.#orders.push(response);

      resolve(response);
    });
  }

  async getPairs() {
    const prices = await this.#binance.futuresPrices();

    return Object.keys(prices).filter((pair) => pair.includes("USDT"));
  }

  getPairsData() {
    return new Promise(async (resolve, reject) => {
      resolve(await this.#binance.futuresExchangeInfo());
    });
  }

  getPricePrecisions() {
    return new Promise(async (resolve, reject) => {
      const exchangeInfo = await this.#binance.futuresExchangeInfo();

      const coinsInfo = exchangeInfo.symbols;

      const precisions = {};

      for (const info of coinsInfo) {
        precisions[info.symbol] = info.filters;
      }

      resolve(precisions);
    });
  }

  openSocket() {
    this.#binance.websockets.userFutureData(
      console.log(),
      console.log(),
      async (updateInfo) => {
        this.#tasksQueue.push(updateInfo);

        if (this.#taskProcessingStatus === 0) {
          this.#taskProcessingStatus = 1;

          while (true) {
            const task = this.#tasksQueue.shift();
            console.log("task processing");
            await this.prcessTaskOrder(task);

            if (this.#tasksQueue.length === 0) {
              this.#taskProcessingStatus = 0;
              break;
            }
          }

          console.log("exit", this.#taskProcessingStatus);
        }
      }
    );
  }

  prcessTaskOrder(updateInfo) {
    return new Promise(async (resolve, reject) => {
      const orderUpdate = updateInfo.order;
      console.log(orderUpdate);

      const ordersData = this.#orders.find(
        (data) => data.symbol == orderUpdate.symbol
      );
      const ordersDataIndex = this.#orders.indexOf(ordersData);

      if (!ordersData) return resolve();

      if (orderUpdate.orderStatus === "FILLED") {
        console.log("Order FILLED");

        //Заполнен побочный ордер
        const isTpOrder = ordersData.subOrders.tps.find(
          (data) => data.orderId === orderUpdate.orderId
        );
        const isSlOrder =
          ordersData.subOrders.sl.orderId === orderUpdate.orderId;

        const isClosingOrder = this.#closingOrders.find(
          (data) => data.orderId === orderUpdate.orderId
        );

        console.log(isTpOrder, isSlOrder, isClosingOrder);

        //Закрытие позиции
        if (isClosingOrder) {
          const closingOrderIndex = this.#closingOrders.indexOf(isClosingOrder);

          const closingOrdersData = this.#orders.find(
            (data) =>
              data.symbol === isClosingOrder.symbol &&
              data.channelName === isClosingOrder.channelName
          );

          const closingOrdersDataIndex =
            this.#orders.indexOf(closingOrdersData);

          //Обновляем статистику
          this.#orders[closingOrdersDataIndex].statistics.profit += Number(
            orderUpdate.realizedProfit
          );

          if (typeof orderUpdate.commission !== "undefined") {
            this.#orders[closingOrdersDataIndex].statistics.commission +=
              Number(orderUpdate.commission);
          }

          const model = {
            ...this.#orders[closingOrdersDataIndex].statistics,
            channelName: this.#orders[closingOrdersDataIndex].channelName,
            timestamp: Date.now(),
          };
          console.log(model);

          await TradingHistoryModel.create(model);

          this.#orders.splice(closingOrdersDataIndex, 1);
          this.#closingOrders.splice(closingOrderIndex, 1);
          return resolve();
        }

        //Заполнен побочный ордер
        if (isTpOrder || isSlOrder) {
          const newPositionSize = await this.filterLotSize(
            ordersData.mainOrder.symbol,
            Number(ordersData.mainOrder.origQty) -
              Number(orderUpdate.originalQuantity)
          );

          this.#orders[ordersDataIndex].mainOrder.origQty = newPositionSize;
        }

        //Тейк-профит
        if (isTpOrder) {
          console.log("Это ТП");

          //Обновляем статистику
          this.#orders[ordersDataIndex].statistics.profit += Number(
            orderUpdate.realizedProfit
          );

          if (orderUpdate.commission) {
            this.#orders[ordersDataIndex].statistics.commission += Number(
              orderUpdate.commission
            );
          }

          //Закрыть стоплоссы
          const cancelStoplossResponse = await this.#binance.futuresCancel(
            ordersData.symbol,
            {
              orderId: ordersData.subOrders.sl.orderId,
            }
          );

          //Позиция полностью закрылась
          if (ordersData.mainOrder.origQty === 0) {
            console.log("Position closed by TP");

            await TradingHistoryModel.create({
              ...this.#orders[ordersDataIndex].statistics,
              channelName: this.#orders[ordersDataIndex].channelName,
              timestamp: Date.now(),
            });

            this.#orders.splice(ordersDataIndex, 1);
            return resolve();
          }

          //Выставляем новый стоплосс
          const newSLOrder = [
            {
              symbol: ordersData.subOrders.sl.symbol,
              side: ordersData.subOrders.sl.side,
              type: ordersData.subOrders.sl.origType,
              quantity: String(this.#orders[ordersDataIndex].mainOrder.origQty),
              positionSide: ordersData.subOrders.sl.positionSide,
            },
          ];

          switch (newSLOrder[0].type) {
            case "STOP_MARKET":
              if (isTpOrder.breakeven) {
                newSLOrder[0].stopPrice = ordersData.mainOrder.price;
                ordersData.subOrders.sl.stopPrice = ordersData.mainOrder.price;
              } else {
                newSLOrder[0].stopPrice = ordersData.subOrders.sl.stopPrice;
              }
              break;

            case "TRAILING_STOP_MARKET":
              newSLOrder[0].callbackRate = ordersData.subOrders.sl.priceRate;
              break;
          }

          const binanceResponse = (
            await this.#binance.futuresMultipleOrders(newSLOrder)
          )[0];

          console.log("new sl", binanceResponse);

          this.#orders[ordersDataIndex].subOrders.sl = binanceResponse;

          return resolve();
        }

        if (isSlOrder) {
          console.log("Это СЛ");

          //Обновляем статистику
          this.#orders[ordersDataIndex].statistics.profit += Number(
            orderUpdate.realizedProfit
          );

          if (orderUpdate.commission) {
            this.#orders[ordersDataIndex].statistics.commission += Number(
              orderUpdate.commission
            );
          }

          //Отменяем тейкпрофиты
          for (const tpOrder of ordersData.subOrders.tps) {
            const cancelTakeprofitResponse = await this.#binance.futuresCancel(
              ordersData.symbol,
              {
                orderId: tpOrder.orderId,
              }
            );
          }

          //Позиция полностью закрылась
          await TradingHistoryModel.create({
            ...this.#orders[ordersDataIndex].statistics,
            channelName: this.#orders[ordersDataIndex].channelName,
            timestamp: Date.now(),
          });

          this.#orders.splice(ordersDataIndex, 1);
          return resolve();
        }
      }

      resolve();
    });
  }

  /**
   * Делит массив ордеров на части по 5 и отправляет на Binance.
   *
   * Binance имеет ограничение на 5 одновременно размещаемых ордеров.
   *
   * @param {[any]} ordersArr
   * @returns Binance respones
   */
  placeMultipleOrders(ordersArr) {
    return new Promise(async (resolve, reject) => {
      try {
        let responses = [];
        let arraysOfOrders = [];

        if (ordersArr.length > 5) {
          for (let i = 0; i < ordersArr.length; i += 5) {
            const chunk = ordersArr.slice(i, i + 5);
            arraysOfOrders.push(chunk);
          }
        } else {
          arraysOfOrders.push(ordersArr);
        }

        for (const orders of arraysOfOrders) {
          const binanceResponses = await this.#binance.futuresMultipleOrders(
            orders
          );
          responses = responses.concat(binanceResponses);
        }

        resolve(responses);
      } catch (error) {
        console.log(error);
        logger.error(error);
        resolve([
          {
            type: "ERROR",
            message: "Ошибка открытия ордеров",
          },
        ]);
      }
    });
  }

  async closePosition(signalData) {
    const ordersData = this.#orders.find(
      (data) =>
        data.symbol === signalData.symbol &&
        data.channelName === signalData.channelName
    );

    if (!ordersData) return;

    const closeMainOrder = {
      symbol: signalData.symbol,
      side: ordersData.mainOrder.side === "BUY" ? "SELL" : "BUY",
      type: "MARKET",
      quantity: String(ordersData.mainOrder.origQty),
      positionSide: ordersData.mainOrder.positionSide,
    };

    console.log(closeMainOrder);

    //Закрытие позиции
    const mainCloseResponse = (
      await this.#binance.futuresMultipleOrders([closeMainOrder])
    )[0];

    mainCloseResponse.channelName = signalData.channelName;

    this.#closingOrders.push(mainCloseResponse);

    console.log("Закрытие позиции", mainCloseResponse);

    //Отменяем стоплосс
    const cancelStoplossResponse = await this.#binance.futuresCancel(
      signalData.symbol,
      {
        orderId: ordersData.subOrders.sl.orderId,
      }
    );

    //Отменяем тейкпрофиты
    for (const tpData of ordersData.subOrders.tps) {
      const cancelResponse = await this.#binance.futuresCancel(
        signalData.symbol,
        {
          orderId: tpData.orderId,
        }
      );
    }

    // const indexOfOrdersData = this.#orders.indexOf(ordersData);
    // this.#orders.splice(indexOfOrdersData, 1);

    return mainCloseResponse;
  }

  filterLotSize(symbol, volume, checkMaxMin = false) {
    return new Promise((resolve, reject) => {
      try {
        const pairInfo = this.pairsData.find((data) => data.symbol === symbol);

        console.log(this.pairsData.map((data) => data.symbol));

        if (!pairInfo) return resolve(volume);

        const volumeFilter = pairInfo.filters.find(
          (filter) => filter.filterType === "LOT_SIZE"
        );

        if (checkMaxMin) {
          if (volume < volumeFilter.minQty) {
            reject(new Error(`[${symbol}] Lot less than Binance require!`));
          }

          if (volume > volumeFilter.maxQty) {
            reject(new Error(`[${symbol}] Lot greater than Binance require!`));
          }
        }

        const volumeStepSizeRemainder =
          (volume - volumeFilter.minQty) % volumeFilter.stepSize;
        if (volumeStepSizeRemainder != 0) {
          const tokens = volumeFilter.stepSize.split(".");
          let precision = 0;
          if (tokens[0] != "1") {
            for (let i = 0; i < tokens[1].length; i++) {
              precision++;
              if (tokens[1][i] == "1") break;
            }
          }
          resolve(+volume.toFixed(precision));
        }

        resolve(volume);
      } catch (err) {
        console.log(err);
        logger.error(err);
        //! При ошибке возвращает первоначальный объем
        resolve(volume);
      }
    });
  }

  filterPrice(symbol, price) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof price === "undefined")
          return reject(new Error("Price in checking filter undefined!"));

        const priceFilter = this.precisions[symbol].find(
          (filter) => filter.filterType === "PRICE_FILTER"
        );

        if (price < priceFilter.minPrice) {
          reject(new Error(`[${symbol}] Price less than Binance require!`));
        }

        if (price > priceFilter.maxPrice) {
          reject(new Error(`[${symbol}] Price greater than Binance require!`));
        }

        const priceTickSizeRemainder =
          (price - priceFilter.minPrice) % priceFilter.tickSize;
        if (priceTickSizeRemainder != 0) {
          const tokens = priceFilter.tickSize.split(".");
          let precision = 0;
          for (let i = 0; i < tokens[1].length; i++) {
            precision++;
            if (tokens[1][i] == "1") break;
          }
          resolve(+price.toFixed(precision));
        }

        resolve(price);
      } catch (err) {
        console.log(err);
        logger.error(err);
        reject(err);
      }
    });
  }

  testConnection() {
    return new Promise(async (resolve, reject) => {
      const testBinance = new Binance().options({
        APIKEY: this.#options.key,
        APISECRET: this.#options.secret,
        useServerTime: true,
        recvWindow: 60000,
        test: true,
      });

      try {
        const response = await testBinance.futuresMarketBuy("ETHUSDT", 1);

        if (response.code) {
          if (response.code == -2014) {
            return resolve({
              type: "ERROR",
              message: "API ключи неверные",
            });
          }
        }

        return resolve({
          type: "CONNECTED",
        });
      } catch (err) {
        console.log(err);

        const response = {
          type: "ERROR",
        };
        if (err.body) {
          if (JSON.parse(err.body).code == -2014) {
            response.message = "API ключи неверные";
          }
        }

        return response;
      }
    });
  }
}

module.exports = BinanceTradingService;
