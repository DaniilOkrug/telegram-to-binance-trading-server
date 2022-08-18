const ApiError = require("../exceptions/api.error");
const TradingService = require("../services/trading.service");

class TradingController {
  async getChannels(req, res, next) {
    try {
      const { refreshToken } = req.cookies;

      const response = await TradingService.getChannels(refreshToken);

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }

  async getAccountStatus(req, res, next) {
    try {
      const { refreshToken } = req.cookies;

      const response = await TradingService.getAccountStatus(refreshToken);

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }

  async addChannel(req, res, next) {
    try {
      const { refreshToken } = req.cookies;
      const { telegramSettings, binanceSettings } = req.body;

      const response = await TradingService.addChannel(
        refreshToken,
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
      const { refreshToken } = req.cookies;
      const { channelName } = req.body;

      const response = await TradingService.deleteChannel(
        refreshToken,
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
