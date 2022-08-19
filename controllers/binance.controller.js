const ApiError = require("../exceptions/api.error");
const BinanceAccountModel = require("../models/binanceAccount.model");
const BinanceService = require("../services/binance.service");
const tokenService = require("../services/token.service");
const tradingService = require("../services/trading.service");

class BinanceController {
  async connect(req, res, next) {
    try {
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");
      const { key, secret } = req.body;

      const binanceAccountData = await BinanceAccountModel.findOne({key, secret});

      if (binanceAccountData) return next(ApiError.BadRequest('API ключи уже были ранее подключены к сервису!'));


      const response = await BinanceService.connect(accessToken, key, secret);

      if (response.type === "ERROR") {
        console.log(response.message);
        return next(ApiError.BadRequest(response.message));
      }
      
      return res.json(await tradingService.getAccountStatus(accessToken));
    } catch (e) {
      next(e);
    }
  }

  async getAccount(req, res, next) {
    try {
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");

      const response = await BinanceService.getAccount(accessToken);
      
      return res.json(response);
    } catch (e) {
      next(e);
    }
  }
}

module.exports = new BinanceController();
