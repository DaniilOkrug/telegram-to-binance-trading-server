const { validationResult } = require("express-validator");

const ApiError = require("../exceptions/api.error");
const tokenModel = require("../models/token.model");
const tokenService = require("../services/token.service");
const userService = require("../services/user.service");

class UserController {
  async refresh(req, res, next) {
    try {
      console.log(req.headers);
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");
      const userData = tokenService.validateAccessToken(accessToken);

      const refreshToken = (await tokenModel.findOne({ user: userData.id })).refreshToken;

      const tokenData = await userService.refresh(refreshToken);

      res.cookie("refreshToken", tokenData.refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: false,
      });
      return res.json(tokenData);
    } catch (e) {
      next(e);
    }
  }

  async registration(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(ApiError.BadRequest("Ошибка валидации", errors.array()));
      }

      const { email, password } = req.body;
      const userData = await userService.registration(email, password);

      res.cookie("refreshToken", userData.refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: false,
      });

      return res.json(userData);
    } catch (e) {
      next(e);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const userData = await userService.login(email, password);

      res.cookie("refreshToken", userData.refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: false,
      });

      return res.json(userData);
    } catch (e) {
      next(e);
    }
  }

  async logout(req, res, next) {
    try {
      const accessToken = tokenService.getAccessTokenFromRequest(req);
      if (!accessToken) throw ApiError.UnauthorizedError("Вы не авторизованы");
      const userData = tokenService.validateAccessToken(accessToken);

      const refreshToken = (await tokenModel.findOne({ user: userData.id })).refreshToken;

      const token = await userService.logout(refreshToken);
      res.clearCookie("refreshToken");

      return res.json(token);
    } catch (e) {
      next(e);
    }
  }
}

module.exports = new UserController();
