const BinanceService = require("../services/binance.service");

class BinanceController {
  async connect(req, res, next) {
    try {
      const { refreshToken } = req.cookies;
      const { key, secret } = req.body;

      const response = await BinanceService.connect(refreshToken, key, secret);

      if (response.type === "ERROR") {
        return next(ApiError.BadRequest(response.message));
      }
      
      return res.json(response);
    } catch (e) {
      next(e);
    }
  }
}

module.exports = new BinanceController();
