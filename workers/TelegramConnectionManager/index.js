const { Worker } = require("worker_threads");

class TelegramConnectionManager {
  #workers = [];

  createWorker(refreshToken, apiId, apiHash, phoneNumber) {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(
          "./workers/TelegramConnectionManager/worker.js",
          { workerData: { refreshToken, apiId, apiHash, phoneNumber } }
        );

        this.#workers.push({
          instance: worker,
          isConnectionRequest: true,
          refreshToken,
          apiId,
          apiHash,
          phoneNumber,
        });

        worker.on("error", (error) => {
          console.log(error);
        });
        worker.on("exit", (exitCode) => {
          console.log("Telegram Connection Worker exit with code: " + exitCode);
        });

        let workerInfo;
        let index;
        worker.on("message", (task) => {
          console.log(task);

          switch (task.type) {
            case "CONNECTION":
              return resolve(task);
              break;

            case "CODE_CONFIRMED":
              workerInfo = this.#workers.find((data) => data.apiId === apiId);
              index = this.#workers.indexOf(workerInfo);

              this.#workers[index].sendingCodeResponse = task;
              this.#workers[index].isSendingCodeCompleted = true;
              break;

            case "ERROR":
              workerInfo = this.#workers.find((data) => data.apiId === apiId);
              index = this.#workers.indexOf(workerInfo);

              if (workerInfo.isConnectionRequest) {
                this.#workers[index].isConnectionRequest = false;
                resolve(task);
                worker.terminate();
              }

              if (this.#workers[index].isSendingCode) {
                this.#workers[index].sendingCodeResponse = task;
                this.#workers[index].isSendingCodeCompleted = true;
              }
              break;

            case "TERMINATE":
              worker.terminate();
              return;
              break;

            default:
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  sendCode(apiId, apiHash, authCode) {
    return new Promise(async (resolve, reject) => {
      const workerInfo = this.#workers.find(
        (data) => data.apiId === apiId && data.apiHash === apiHash
      );
      const index = this.#workers.indexOf(workerInfo);

      this.#workers[index].isSendingCode = true;
      this.#workers[index].isSendingCodeCompleted = false;

      this.#workers[index].instance.postMessage(authCode);

      const waitResponse = () => {
        return new Promise((resolveWait) => {
          setInterval(() => {
            if (this.#workers[index].isSendingCodeCompleted) resolveWait();
          }, 1000);
        });
      };

      await waitResponse();

      console.log("Code confirmed wait response finished");

      resolve(this.#workers[index].sendingCodeResponse);
    });
  }
}

class Singleton {
  constructor() {
    throw new Error("Use Singleton.getInstance()");
  }
  static getInstance() {
    if (!Singleton.instance) {
      Singleton.instance = new TelegramConnectionManager();
    }
    return Singleton.instance;
  }
}

module.exports = Singleton.getInstance();
