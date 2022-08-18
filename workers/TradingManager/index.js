const { Worker } = require("worker_threads");
const ApiError = require("../../exceptions/api.error");

/**
 * Управляет сигналами с Telegram и торгует на Binance.
 * Для каждого пользователя 1 worker.
 */
class TradingManager {
  /**
   * Хранит информацию о всех workers
   *
   * @type {[{
   *    instance: Worker,
   *    userId: string,
   *    sessionToken: string,
   *    telegramSettings: {
   *        channelName: string,
   *        signalWordsLong: string[],
   *        signalWordsShort: string[]
   *    },
   *    binanceSettings: {
   *
   *    }
   * }]}
   */
  #workers = [];

  /**
   * Создает нового Worker
   *
   * @param {string} userId
   * @param {string} channelName
   * @param {string[]} signalWordsLong
   * @param {string[]} signalWordsShort
   * @returns
   */
  createWorker(userId, telegramConnection, binanceConnection, telegramSettings, binanceSettings) {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker("./workers/TradingManager/worker.js", {
          workerData: JSON.stringify({
            userId,
            telegramConnection,
            binanceConnection,
            telegramSettings,
            binanceSettings,
          }),
        });

        this.#workers.push({
          instance: worker,
          userId,
          telegramConnection,
          binanceConnection,
          telegramSettings,
          binanceSettings,
        });

        worker.on("error", (error) => {
          console.log(error);
        });
        worker.on("exit", (exitCode) => {
          console.log("Trading Worker exit with code: " + exitCode);

          const workerData = this.#workers.find(
            (data) => data.instance === worker
          );
          const index = this.#workers.indexOf(workerData);

          if (index > -1) {
            this.#workers.splice(index, 1);
          }
        });

        worker.on("message", (task) => {
          console.log(task);

          switch (task.type) {
            case "CHANNEL_RESPONSE":
              let workerIndex = this.getWorkerIndex(userId);

              if (task.isError) {
                this.#workers[workerIndex][task.field].response = {
                  type: "ERROR",
                  message: task.message,
                };
              } else {
                this.#workers[workerIndex][task.field].response = {
                  message: task.message,
                };
              }

              this.#workers[workerIndex][task.field].waitResponse = false;
              break;

            case "CONNECTED":
              resolve(task);
              break;

            case "CONNECTION_ERROR":
              resolve(task);
              worker.terminate();
              break;

            case "TERMINATE":
              //Задержка удаления воркера для завершения обработки запроса по удалению канала
              setTimeout(() => {
                worker.terminate();

                this.deleteWorker(userId);
              }, 3000);

              return;

            default:
              console.log("Неизвестная команда для TradingManager");
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  getWorkers() {
    return this.#workers;
  }

  deleteWorker(userId) {
    const workerIndex = this.getWorkerIndex(userId);

    if (workerIndex > -1) {
      this.#workers.splice(workerIndex, 1);
    }
  }

  getWorkerIndex(userId) {
    const workerData = this.#workers.find((data) => data.userId === userId);
    return this.#workers.indexOf(workerData);
  }

  /**
   * Добавляет канал для существующего воркера пользователя
   */
  addChannel(userId, telegramSettings, binanceSettings) {
    return new Promise(async (resolve, reject) => {
      const userWorker = this.#workers.find((data) => data.userId === userId);

      if (!userWorker) {
        throw ApiError.BadRequest("Не удалось добавить канал!");
      }

      const workerIndex = this.#workers.indexOf(userWorker);
      this.#workers[workerIndex].addChannel = {
        waitResponse: true,
      };

      userWorker.instance.postMessage(
        JSON.stringify({
          type: "ADD_CHANNEL",
          message: {
            telegramSettings,
            binanceSettings,
          },
          field: "addChannel",
        })
      );

      const waitResponse = () => {
        return new Promise((resolveWait) => {
          const timer = setInterval(() => {
            if (!this.#workers[workerIndex].addChannel.waitResponse)
              resolveWait();
              clearInterval(timer);
          }, 1000);
        });
      };

      await waitResponse();

      resolve(this.#workers[workerIndex].addChannel.response);
    });
  }

  /**
   * Удаляет канал для существующего воркера пользователя
   */
  deleteChannel(userId, channelName) {
    return new Promise(async (resolve, reject) => {
      const userWorker = this.#workers.find((data) => data.userId === userId);

      if (!userWorker) {
        throw ApiError.BadRequest("Не удалось удалить канал!");
      }

      const workerIndex = this.#workers.indexOf(userWorker);
      this.#workers[workerIndex].deleteChannel = {
        waitResponse: true,
      };

      userWorker.instance.postMessage(
        JSON.stringify({
          type: "DELETE_CHANNEL",
          message: {
            channelName,
          },
          field: "deleteChannel",
        })
      );


      const waitResponse = () => {
        return new Promise((resolveWait) => {
          const timer = setInterval(() => {
            if (!this.#workers[workerIndex].deleteChannel.waitResponse)
              resolveWait();
              clearInterval(timer);
          }, 200);
        });
      };

      await waitResponse();

      resolve(this.#workers[workerIndex].deleteChannel.response);
    });
  }
}

class Singleton {
  constructor() {
    throw new Error("Use Singleton.getInstance()");
  }
  static getInstance() {
    if (!Singleton.instance) {
      Singleton.instance = new TradingManager();
    }
    return Singleton.instance;
  }
}

module.exports = Singleton.getInstance();