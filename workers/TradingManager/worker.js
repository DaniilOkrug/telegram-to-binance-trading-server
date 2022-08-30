const { parentPort, workerData } = require("worker_threads");
const mongoose = require("mongoose");

const { TelegramClient } = require("telegram");
const { NewMessage } = require("telegram/events");
const { StringSession } = require("telegram/sessions");

const SignalService = require("./services/signal.service");
const BinanceTradingService = require("./services/binanceTrading.service");
const { logger } = require("../../util/logger");

console.log("TradingWorker started");
const INITIAL_SETTINGS = JSON.parse(workerData);
console.log(INITIAL_SETTINGS);

const BinanceTrading = new BinanceTradingService(
  INITIAL_SETTINGS.binanceConnection.key,
  INITIAL_SETTINGS.binanceConnection.secret
);

const channelsSettings = [
  {
    telegramSettings: INITIAL_SETTINGS.telegramSettings,
    binanceSettings: INITIAL_SETTINGS.binanceSettings,
  },
];

let allUserChannels = [];
let pairs = [];

// console.log("INITIAL_SETTINGS", INITIAL_SETTINGS);

(async () => {
  try {
    //Connect Database
    mongoose.connect(process.env.DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    //Тестируем Binance аккаунт
    const response = await BinanceTrading.testConnection();

    if (response.type === "ERROR") {
      parentPort.postMessage({ type: "TERMINATE" });
      parentPort.close();
    }

    //Получаем пары с Binance
    pairs = await BinanceTrading.getPairs();

    BinanceTrading.pairsData = (await BinanceTrading.getPairsData()).symbols;
    BinanceTrading.precisions = await BinanceTrading.getPricePrecisions();

    //Подключаем Telegram
    const stringSession = new StringSession(
      INITIAL_SETTINGS.telegramConnection.sessionToken
    );

    const client = new TelegramClient(
      stringSession,
      Number(INITIAL_SETTINGS.telegramConnection.apiId),
      INITIAL_SETTINGS.telegramConnection.apiHash,
      {
        connectionRetries: 20,
      }
    );

    await client.start();

    console.log("Client connected.");

    allUserChannels = await client.getDialogs();

    //Обработка сообщений из каналов
    client.addEventHandler(async (event) => {
      for (const channelSettings of channelsSettings) {
        const channel = allUserChannels.find(
          (dialog) =>
            dialog.isChannel &&
            dialog.entity.title === channelSettings.telegramSettings.channelName
        );

        if (
          event.message.peerId.channelId?.value ===
          channel.inputEntity.channelId.value
        ) {
          const messageText = event.message.message;

          console.log("New signal message: ", messageText);
          logger.info("New signal message: " + messageText);

          const signalData = SignalService.determineSignal(messageText, {
            pairs,
            signalWordsLong: INITIAL_SETTINGS.telegramSettings.signalWordsLong,
            signalWordsShort:
              INITIAL_SETTINGS.telegramSettings.signalWordsShort,
            closeWords: INITIAL_SETTINGS.telegramSettings.closeWords,
          });

          
          signalData.channelName = channelSettings.telegramSettings.channelName;
          
          console.log(signalData);
          logger.info(signalData);

          if (signalData.isSignal) {
            if (signalData.isClose) {
              const response = await BinanceTrading.closePosition(signalData);
            } else {
              const response = await BinanceTrading.openOrder(
                signalData,
                channelSettings.binanceSettings,
                INITIAL_SETTINGS.userId
              );
            }
          }
        }
      }
    }, new NewMessage({}));

    parentPort.postMessage({
      type: "CONNECTED",
    });
  } catch (error) {
    console.error(error);
    logger.error(error);

    setTimeout(() => {
      parentPort.postMessage({
        type: "CONNECTION_ERROR",
        message: "Ошибка подключения к Telegram аккаунту",
      });

      parentPort.postMessage({ type: "TERMINATE" });
      parentPort.close();
    }, 1000);
  }
})();

parentPort.on("message", (taskString) => {
  const task = JSON.parse(taskString);

  switch (task.type) {
    case "ADD_CHANNEL":
      channelsSettings.push(task.message);
      parentPort.postMessage({
        type: "CHANNEL_RESPONSE",
        message: "Канал добавлен",
        field: task.field,
      });
      break;

    case "DELETE_CHANNEL":
      const channel = channelsSettings.find(
        (data) => data.telegramSettings.channelName === task.message.channelName
      );
      const channelIndex = channelsSettings.indexOf(channel);

      if (channelIndex > -1) {
        channelsSettings.splice(channelIndex, 1);

        parentPort.postMessage({
          type: "CHANNEL_RESPONSE",
          message: "Канал удален",
          field: task.field,
        });
      } else {
        parentPort.postMessage({
          type: "CHANNEL_RESPONSE",
          message: "Робот не следит за данным каналом",
          field: task.field,
          isError: true,
        });
      }
      break;

    default:
      break;
  }

  console.log(channelsSettings);

  if (channelsSettings.length === 0) {
    parentPort.postMessage({ type: "TERMINATE" });
    parentPort.close();
  }
});
