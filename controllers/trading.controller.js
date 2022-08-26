const ApiError = require("../exceptions/api.error");
const tokenService = require("../services/token.service");
const TradingService = require("../services/trading.service");

class TradingController {
  async getChannels(req, res, next) {
    try {
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");

      const response = await TradingService.getChannels(accessToken);

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }

  async getTradingHistory(req, res, next) {
    try {
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");

      const response = await TradingService.getTradingHistory(accessToken);

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }

  async getAccountStatus(req, res, next) {
    try {
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");

      const response = await TradingService.getAccountStatus(accessToken);

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }

  async addChannel(req, res, next) {
    try {
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");

      const { telegramSettings, binanceSettings } = req.body;

      const response = await TradingService.addChannel(
        accessToken,
        telegramSettings,
        binanceSettings
      );

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }

  async deleteChannel(req, res, next) {
    try {
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");

      const { channelName } = req.body;

      const response = await TradingService.deleteChannel(
        accessToken,
        channelName
      );

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }

  /**
   * TODO: Нужно реализовать функционал отсановки торговли на канале без его удаления из БД
   *
   * @param {*} req
   * @param {*} res
   * @param {*} next
   * @returns
   */
  async stopChannel(req, res, next) {
    try {
      const { refreshToken } = req.cookies;

      const { channelName } = req.body;

      const response = {};
      S;

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }
}

module.exports = new TradingController();
