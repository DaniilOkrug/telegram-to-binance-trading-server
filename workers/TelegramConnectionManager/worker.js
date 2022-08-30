require("dotenv").config();
const { parentPort, workerData } = require("worker_threads");
const mongoose = require("mongoose");

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const TelegramAccountModel = require("../../models/telegramAccount.model");
const tokenService = require("../../services/token.service");
const TradingHistoryModel = require("../../models/tradeHistory.model");

const { logger } = require("../../util/logger");

console.log("Telegram Connection Worker started");

const stringSession = new StringSession("");
let waitAuthCode = true;
let authCode = "";

parentPort.on("message", async (code) => {
  if (authCode === "") {
    authCode = code;
    waitAuthCode = false;
  }
});

(async () => {
  try {
    //Connect Database
    mongoose.connect(process.env.DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const client = new TelegramClient(
      stringSession,
      Number(workerData.apiId),
      workerData.apiHash,
      {
        useWSS: false,
      }
    );

    //Authentification
    await client.start({
      phoneNumber: async () => `+${workerData.phoneNumber}`,
      phoneCode: async () => {
        parentPort.postMessage({
          type: "CONNECTION",
        });

        await waitCode();

        return authCode;
      },
      onError: async (err) => {
        console.log(err);
        logger.error(err);

        switch (err.code) {
          case 420:
            parentPort.postMessage({
              type: "ERROR",
              message: "Telegram Flood - подождите и повторите запрос.",
            });
            break;

          case 400:
            parentPort.postMessage({
              type: "ERROR",
              message: "Неверный API Id",
            });
            break;

          default:
            parentPort.postMessage({
              type: "ERROR",
              message: "Ошибка подключения",
            });
        }

        parentPort.postMessage({ type: "TERMINATE" });
        parentPort.close();
      },
    });

    const telegramAuthToken = client.session.save();

    console.log(telegramAuthToken);

    const userData = tokenService.validateAccessToken(workerData.accessToken);

    const telegramDataCondition = {
      user: userData.id,
    };
    const telegramData = await TelegramAccountModel.findOne(
      telegramDataCondition
    );

    if (telegramData) {
      await TelegramAccountModel.findOneAndUpdate(telegramDataCondition, {
        sessionToken: telegramAuthToken,
      });
    } else {
      await TelegramAccountModel.create({
        user: userData.id,
        apiId: workerData.apiId,
        apiHash: workerData.apiHash,
        phoneNumber: workerData.phoneNumber,
        sessionToken: telegramAuthToken,
      });
    }

    parentPort.postMessage({
      type: "CODE_CONFIRMED",
    });

    await client.sendMessage("me", { message: "Telegram Trade подключен!" });

    parentPort.postMessage({ type: "TERMINATE" });
    parentPort.close();
  } catch (err) {
    console.error(err);
    logger.error(err)

    parentPort.postMessage({
      type: "ERROR",
      message: "Ошибка подключения",
    });

    parentPort.postMessage({ type: "TERMINATE" });
  }
})();

function waitCode() {
  return new Promise((resolve) => {
    setInterval(() => {
      if (!waitAuthCode) resolve();
    }, 1000);
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
