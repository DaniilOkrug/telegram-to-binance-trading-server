const Binance = require("node-binance-api");

class BinanceTradingService {
  #options;
  #binance;
  #orders = [];
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
  }

  openOrder(signalData, binanceSettings) {
    return new Promise(async (resolve, reject) => {
      //Задаем плечо
      await this.#binance.futuresLeverage(
        signalData.symbol,
        binanceSettings.leverage
      );

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

      const mainOrderResponse = (
        await this.#binance.futuresMultipleOrders(mainOrder)
      )[0];

      console.log(mainOrderResponse);

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
      for (let i = 0; i < binanceSettings.tps.length; i++) {
        const offsetPrice =
          (Number(price) * Number(binanceSettings.tps[i].offset)) / 100;
        const tpPrice =
          signalData.positionSide === "LONG"
            ? Number(price) + offsetPrice
            : Number(price) - offsetPrice;

        //Для последнего ТП
        if (i >= binanceSettings.tps.length - 1) {
          orders.push({
            symbol: signalData.symbol,
            side: signalData.side === "BUY" ? "SELL" : "BUY",
            type: "TAKE_PROFIT_MARKET",
            stopPrice: String(
              await this.filterPrice(signalData.symbol, Number(tpPrice))
            ),
            quantity: String(
              Number(mainOrderResponse.origQty) - accumulatedTpVolume
            ),
            positionSide: signalData.positionSide,
          });
          break;
        }

        //Для первых ТП исключая последний
        const tpQty =
          (Number(mainOrderResponse.origQty) * binanceSettings.tps[i].amount) /
          100;
        const validTpQty = await this.filterLotSize(signalData.symbol, tpQty);

        accumulatedTpVolume += validTpQty;

        orders.push({
          symbol: signalData.symbol,
          side: signalData.side === "BUY" ? "SELL" : "BUY",
          type: "TAKE_PROFIT_MARKET",
          stopPrice: String(
            await this.filterPrice(signalData.symbol, Number(tpPrice))
          ),
          quantity: String(validTpQty),
          positionSide: signalData.positionSide,
        });
      }

      //Cтоп-лосс
      let accumulatedSlVolume = 0;
      for (let i = 0; i < binanceSettings.sls.length; i++) {
        const offsetPrice =
          (Number(price) * Number(binanceSettings.sls[i].offset)) / 100;
        const slPrice =
          signalData.positionSide === "LONG"
            ? Number(price) - offsetPrice
            : Number(price) + offsetPrice;

        //Для последнего ТП
        if (i >= binanceSettings.tps.length - 1) {
          orders.push({
            symbol: signalData.symbol,
            side: signalData.side === "BUY" ? "SELL" : "BUY",
            type: "STOP_MARKET",
            stopPrice: String(
              await this.filterPrice(signalData.symbol, Number(slPrice))
            ),
            quantity: String(
              Number(mainOrderResponse.origQty) - accumulatedSlVolume
            ),
            positionSide: signalData.positionSide,
          });
          break;
        }

        //Для первых ТП исключая последний
        const slQty =
          (Number(mainOrderResponse.origQty) * binanceSettings.sls[i].amount) /
          100;
        const validSlQty = await this.filterLotSize(signalData.symbol, slQty);

        accumulatedSlVolume += validSlQty;

        orders.push({
          symbol: signalData.symbol,
          side: signalData.side === "BUY" ? "SELL" : "BUY",
          type: "STOP_MARKET",
          stopPrice: String(
            await this.filterPrice(signalData.symbol, Number(slPrice))
          ),
          quantity: String(validSlQty),
          positionSide: signalData.positionSide,
        });
      }

      console.log(orders);

      const ordersResponse = await this.#binance.futuresMultipleOrders(orders);

      console.log(ordersResponse);

      //Проверка ошибки при выставлении оредров
      for (const binanceResponse of ordersResponse) {
        if (!binanceResponse.orderId) {
          //   logger.error(binanceLongResponse);
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

      const response = {
        mainOrder: mainOrderResponse,
        subOrders: ordersResponse,
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
      resolve(await this.#binance.futuresExchangeInfo())
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

  //   openSocket() {
  //     this.#binance.websockets.userFutureData(
  //       console.log(),
  //       console.log(),
  //       async (updateInfo) => {
  //         const orderUpdate = updateInfo.order;

  //         const orderData = orders.find(data => data.mainOrder.orderId == orderUpdate.orderId);

  //         if (!orderData) return;

  //         if (orderUpdate.orderStatus === 'FILLED' && orderData.origQty == orderUpdate.originalQuantity) {

  //         }
  //       }
  //     );
  //   }

  filterLotSize(symbol, volume) {
    return new Promise((resolve, reject) => {
      try {
        const pairInfo = this.pairsData.find((data) => data.symbol === symbol);

        console.log(this.pairsData.map(data => data.symbol));

        if(!pairInfo) return resolve(volume);

        const volumeFilter = pairInfo.filters.find(
          (filter) => filter.filterType === "LOT_SIZE"
        );

        if (volume < volumeFilter.minQty) {
          reject(
            new Error(`[${this.options.pair}] Lot less than Binance require!`)
          );
        }

        if (volume > volumeFilter.maxQty) {
          reject(
            new Error(
              `[${this.options.pair}] Lot greater than Binance require!`
            )
          );
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
