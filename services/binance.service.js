const Binance = require("node-binance-api");
const TokenService = require("./token.service");
const BinanceAccountModel = require("../models/binanceAccount.model");
const binanceAccountModel = require("../models/binanceAccount.model");

class BinanceService {
  async connect(accessToken, key, secret) {
    console.log(key, secret);
    const binance = new Binance().options({
      APIKEY: key,
      APISECRET: secret,
      useServerTime: true,
      recvWindow: 60000,
      test: true,
    });

    try {
      // const response = await binance.futuresMarketBuy("ETHUSDT", 1);
      // console.log(response);

      // if (response.code) {
      //   switch (response.code) {
      //     case -2014:
      //       return {
      //         type: "ERROR",
      //         message: "API ключи неверные",
      //       };

      //     case -2015:
      //       return {
      //         type: "ERROR",
      //         message: "Ключи не имеют нужных разрешений",
      //       };

      //     default:
      //       return {
      //         type: "ERROR",
      //         message: "Ошибка подключения ключей",
      //       };
      //   }
      // }

      const userData = TokenService.validateAccessToken(accessToken);
      const binanceAccountData = await BinanceAccountModel.findOne({
        user: userData.id,
      });

      if (binanceAccountData) {
        await BinanceAccountModel.findOneAndUpdate(
          { user: userData.id },
          {
            key,
            secret,
          }
        );
      } else {
        await BinanceAccountModel.create({
          user: userData.id,
          key,
          secret,
        });
      }

      return {
        key,
        secret,
      };
    } catch (err) {
      console.log(err);
      const response = {
        type: "ERROR",
        message: "Ошибка подключения",
      };

      if (err.body) {
        if (JSON.parse(err.body).code == -2014) {
          response.message = "API ключи неверные";
        }
      }

      return response;
    }
  }

  async getAccount(accessToken) {
    const userData = TokenService.validateAccessToken(accessToken);

    const binanceAccountData = await binanceAccountModel.findOne({
      user: userData.id,
    });

    if (binanceAccountData) {
      return {
        key: binanceAccountData.key,
        secret: binanceAccountData.secret,
      };
    } else {
      return {
        key: "",
        secret: "",
      };
    }
  }
}

module.exports = new BinanceService();
