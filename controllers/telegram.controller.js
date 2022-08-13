const TelegramService = require("../services/telegram.service");
const TokenService = require("../services/token.service");
const ApiError = require("../exceptions/api.error");

class TelegramController {
  async connect(req, res, next) {
    try {
      const { refreshToken } = req.cookies;
      const { apiId, apiHash, phoneNumber } = req.body;

      const response = await TelegramService.connect(
        refreshToken,
        apiId,
        apiHash,
        phoneNumber
      );

      if (response.type === "CONNECTION") {
        return res.json({
          status: "Connection opened",
        });
      }

      if (response.type === "ERROR") {
        return next(ApiError.BadRequest(response.message));
      }

      return next(ApiError.BadRequest("Ошибка подключения"));

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }

  async code(req, res, next) {
    try {
      const { refreshToken } = req.cookies;
      const { apiId, apiHash, phoneNumber, authCode } = req.body;

      if (authCode === "") {
        return next(ApiError.BadRequest("Ошибка валидации"));
      }

      const response = await TelegramService.code(apiId, apiHash, authCode);

      if (response.type === "CODE_CONFIRMED") {
        return res.json({
          status: "Code confirmed",
        });
      }

      if (response.type === "ERROR") {
        return next(ApiError.BadRequest(response.message));
      }

      return next(ApiError.BadRequest("Ошибка подключения"));
    } catch (e) {
      next(e);
    }
  }

  async getAccount(req, res, next) {
    try {
      const { refreshToken } = req.cookies;

      const userData = TokenService.validateRefreshToken(refreshToken);
      if (!userData) return ApiError.UnauthorizedError("Вы не авторизованы!");

      const response = await TelegramService.getAccount(userData);

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }
}

module.exports = new TelegramController();
