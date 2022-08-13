const TelegramConnectionManager = require("../workers/TelegramConnectionManager");
const tokenService = require("./token.service");
const ApiError = require("../exceptions/api.error");

const TelegramAccountModel = require("../models/telegramAccount.model");

class TelegramService {
  async connect(refreshToken, apiId, apiHash, phoneNumber) {
    const response = await TelegramConnectionManager.createWorker(
      refreshToken,
      apiId,
      apiHash,
      phoneNumber
    );

    return response;
  }

  async code(apiId, apiHash, authCode) {
    const response = await TelegramConnectionManager.sendCode(
      apiId,
      apiHash,
      authCode,
    );

    return response;
  }

  async getAccount(userData) {
    const telegramData = await TelegramAccountModel.findOne({user: userData.id});
    
    if (telegramData) {
      return {
        apiId: telegramData.apiId,
        apiHash: telegramData.apiHash,
        phoneNumber: telegramData.phoneNumber,
      }
    } else {
      return {
        apiId: "",
        apiHash: "",
        phoneNumber: "",
      }
    }
  }
}

module.exports = new TelegramService();