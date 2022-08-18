const ApiError = require("../exceptions/api.error");
const TradingManager = require("../workers/TradingManager/index");
const TelegramSettingsMiddleware = require("../middleware/telegramSettings.middleware");
const tokenService = require("./token.service");

const TelegramAccountModel = require("../models/telegramAccount.model");
const TelegramTradingChannelsModel = require("../models/telegramTradingChannels.model");
const BinanceAccountModel = require("../models/binanceAccount.model");

class TradingService {
  async startBotsFromDB() {
    const TelegramTradingChannels_ACTIVE =
      await TelegramTradingChannelsModel.find({
        status: "Active",
      });

    if (TelegramTradingChannels_ACTIVE.length > 0) {
      for (const channel of TelegramTradingChannels_ACTIVE) {
        const telegramAccountData = await TelegramAccountModel.findOne({
          user: channel.user,
        });

        const binanceAccountData = await BinanceAccountModel.findOne({
          user: channel.user,
        });

        const telegramConnection = {
          apiId: telegramAccountData.apiId,
          apiHash: telegramAccountData.apiHash,
          sessionToken: telegramAccountData.sessionToken,
        };

        const binanceConnection = {
          key: binanceAccountData.key,
          secret: binanceAccountData.secret,
        };

        const startedWorkers = TradingManager.getWorkers();
        const userWorker = startedWorkers.find(
          (data) => data.userId === channel.user.toString()
        );

        if (userWorker) {
          await TradingManager.addChannel(
            channel.user.toString(),
            channel.telegramSettings,
            channel.binanceSettings
          );
        } else {
          await TradingManager.createWorker(
            channel.user.toString(),
            telegramConnection,
            binanceConnection,
            channel.telegramSettings,
            channel.binanceSettings
          );
        }
      }
    }
  }

  async getChannels(refreshToken) {
    const userData = tokenService.validateRefreshToken(refreshToken);

    const userChannelsData = await TelegramTradingChannelsModel.find({
      user: userData.id,
    });

    return userChannelsData.map((userChannel) => {
      return {
        status: userChannel.status,
        telegramSettings: userChannel.telegramSettings,
        binanceSettings: userChannel.binanceSettings,
      };
    });
  }

  async addChannel(refreshToken, telegramSettings, binanceSettings) {
    const signalWordsLongArr = TelegramSettingsMiddleware.parseSignalWords(
      telegramSettings.signalWordsLong
    );
    const signalWordsShortArr = TelegramSettingsMiddleware.parseSignalWords(
      telegramSettings.signalWordsShort
    );

    if (signalWordsLongArr.length === 0 && signalWordsShortArr.length === 0)
      throw ApiError.BadRequest("Сигнальные слова неверные");

    if (telegramSettings.channelName === "")
      throw ApiError.BadRequest("Некорретное название канала");

    const startedWorkers = TradingManager.getWorkers();

    const userData = tokenService.validateRefreshToken(refreshToken);

    const userWorker = startedWorkers.find(
      (workerData) => workerData.userId === userData.id
    );

    const telegramAccountData = await TelegramAccountModel.findOne({
      user: userData.id,
    });

    if (!telegramAccountData) {
      throw ApiError.BadRequest("Ваш телеграм аккаунт не найден в базе данных");
    }

    const binanceAccountData = await BinanceAccountModel.findOne({
      user: userData.id,
    });

    if (!binanceAccountData) {
      throw ApiError.BadRequest("Ваш Binance аккаунт не найден в базе данных");
    }

    let workerResponse = {};
    if (userWorker) {
      workerResponse = await TradingManager.addChannel(
        userData.id,
        telegramSettings,
        binanceSettings
      );

      await TelegramTradingChannelsModel.create({
        user: userData.id,
        status: "Active",
        telegramSettings,
        binanceSettings,
      });
    } else {
      const telegramConnection = {
        apiId: telegramAccountData.apiId,
        apiHash: telegramAccountData.apiHash,
        sessionToken: telegramAccountData.sessionToken,
      };

      const binanceConnection = {
        key: binanceAccountData.key,
        secret: binanceAccountData.secret,
      };

      workerResponse = await TradingManager.createWorker(
        userData.id,
        telegramConnection,
        binanceConnection,
        telegramSettings,
        binanceSettings
      );

      switch (workerResponse.type) {
        case "CONNECTED":
          await TelegramTradingChannelsModel.create({
            user: userData.id,
            status: "Active",
            telegramSettings,
            binanceSettings,
          });

          return {
            channelName: telegramSettings.channelName,
          };

        case "CONNECTION_ERROR":
          throw ApiError.BadRequest(workerResponse.message);

        default:
          break;
      }
    }

    return await this.getChannels(refreshToken);
  }

  async deleteChannel(refreshToken, channelName) {
    if (channelName === "") throw ApiError.BadRequest("Название канала пустое");

    const userData = tokenService.validateRefreshToken(refreshToken);

    const userChannelsData = await TelegramTradingChannelsModel.find({
      user: userData.id,
    });

    if (userChannelsData.length === 0)
      throw ApiError.BadRequest("Не найдены каналы пользователя");

    let channelData;
    for (const userChannel of userChannelsData) {
      if (userChannel.telegramSettings.channelName === channelName) {
        channelData = userChannel;
        break;
      }
    }

    if (!channelData) throw ApiError.BadRequest("Не найден канал для удаления");

    const response = await TradingManager.deleteChannel(
      userData.id.toString(),
      channelName
    );

    if (response.type === "ERROR") throw ApiError.BadRequest(response.message);

    await TelegramTradingChannelsModel.findByIdAndDelete(channelData.id);

    return await this.getChannels(refreshToken);
  }

  async getAccountStatus(refreshToken) {
    const userData = tokenService.validateRefreshToken(refreshToken);

    const telegramAccountData = await TelegramAccountModel.findOne({
      user: userData.id,
    });

    const binanceAccountData = await BinanceAccountModel.findOne({
      user: userData.id,
    });

    const response = {};
    if (telegramAccountData) {
      response.isTelegramConnected = true;
    } else {
      response.isTelegramConnected = false;
    }

    if (binanceAccountData) {
      response.isBinanceConnected = true;
    } else {
      response.isBinanceConnected = false;
    }

    return response;
  }
}

module.exports = new TradingService();
