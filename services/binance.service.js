const Binance = require("node-binance-api");
const TokenService = require("./token.service");
const BinanceAccountModel = require("../models/binanceAccount.model");

class BinanceService {
  async connect(refreshToken, key, secret) {
    const binance = new Binance().options({
      APIKEY: key,
      APISECRET: secret,
      useServerTime: true,
      recvWindow: 60000,
      test: true,
    });

    try {
      const response = await binance.futuresаMarketBuy("ETHUSDT", 1);

      if (response.code) {
        if (response.code == -2014) {
          return resolve({
            type: "ERROR",
            message: "API ключи неверные",
          });
        }
      }

      const userData = await TokenService.validateRefreshToken(refreshToken);
      const binanceAccountData = await BinanceAccountModel.findOne({
        user: userData.id,
      });

      if (binanceAccountData) {
        await BinanceAccountModel.findOneAndUpdate({user: userData.id}, {
            key,
            secret
          });
      } else {
        await BinanceAccountModel.create({
            user: userData.id,
            key,
            secret
        })
      }

      return {
        key,
        secret,
      };
    } catch (err) {
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
}

module.exports = new BinanceService();
