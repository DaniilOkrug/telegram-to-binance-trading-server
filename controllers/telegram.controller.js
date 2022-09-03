const ApiError = require("../exceptions/api.error");
const TelegramService = require("../services/telegram.service");
const tokenService = require("../services/token.service");

class TelegramController {
  async connect(req, res, next) {
    try {
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");

      const { apiId, apiHash, phoneNumber } = req.body;

      const response = await TelegramService.connect(
        accessToken,
        apiId,
        apiHash,
        phoneNumber
      );

      console.log("response", response);

      if (response.type === "CONNECTION") {
        return res.json({
          status: "Connection opened",
        });
      }

      console.log("connect response", response);

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
      const { apiId, apiHash, authCode } = req.body;

      if (authCode === "") {
        return next(ApiError.BadRequest("Ошибка валидации"));
      }

      const response = await TelegramService.code(apiId, apiHash, authCode);

      if (response.type === "CODE_CONFIRMED") {
        const accessToken = tokenService.getAccessTokenFromRequest(req);
        if (!accessToken)
          throw ApiError.UnauthorizedError("Вы не авторизованы");

        const userData = tokenService.validateAccessToken(accessToken);
        return res.json(await TelegramService.getAccount(userData));
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
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");

      const userData = tokenService.validateAccessToken(accessToken);
      if (!userData) return ApiError.UnauthorizedError("Вы не авторизованы!");

      const response = await TelegramService.getAccount(userData);

      return res.json(response);
    } catch (e) {
      next(e);
    }
  }
}

module.exports = new TelegramController();
