const { Worker } = require("worker_threads");

class TelegramConnectionManager {
  #workers = [];
  #isSendingCodeCompleted = []; //ApiIds

  createWorker(accessToken, apiId, apiHash, phoneNumber) {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(
          "./workers/TelegramConnectionManager/worker.js",
          { workerData: { accessToken, apiId, apiHash, phoneNumber } }
        );

        this.#workers.push({
          instance: worker,
          isConnectionRequest: true,
          accessToken,
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
              workerInfo = this.#workers.find((data) => data.apiId === apiId);
              index = this.#workers.indexOf(workerInfo);

              this.#workers[index].isConnectionRequest = false;

              return resolve(task);

            case "CODE_CONFIRMED":
              workerInfo = this.#workers.find((data) => data.apiId === apiId);
              index = this.#workers.indexOf(workerInfo);

              this.#isSendingCodeCompleted.push({
                apiId,
                response: task,
              });
              break;

            case "ERROR":
              workerInfo = this.#workers.find((data) => data.apiId === apiId);
              index = this.#workers.indexOf(workerInfo);

              if (this.#workers[index].isConnectionRequest) {
                this.#workers[index].isConnectionRequest = false;
                return resolve(task);
              }

              if (this.#workers[index].isSendingCode) {
                this.#isSendingCodeCompleted.push({
                  apiId,
                  response: task,
                });
              }
              break;

            case "TERMINATE":
              setTimeout(() => {
                worker.terminate();

                if (task.deleteWorker) {
                  this.deleteWorkerFromArray(apiId, apiHash);
                }
              }, 1000);
              return;

            default:
              console.log("Неизветная команда для TelegramConnectionManager");
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

      this.#workers[index].instance.postMessage(authCode);

      const waitResponse = () => {
        return new Promise((resolveWait) => {
          setInterval(() => {
            const includedCodeData = this.#isSendingCodeCompleted.find(
              (data) => data.apiId === apiId
            );
            const includedCodeIndex =
              this.#isSendingCodeCompleted.indexOf(includedCodeData);

            if (includedCodeIndex > -1) {
              resolveWait(
                this.#isSendingCodeCompleted[includedCodeIndex].response
              );
              this.#isSendingCodeCompleted.splice(includedCodeIndex, 1);
            }
          }, 1000);
        });
      };

      const response = await waitResponse();

      console.log("Code confirmed wait response finished");

      resolve(response);

      this.deleteWorkerFromArray(apiId, apiHash);
    });
  }

  closeConnection(apiId, apiHash) {
    const workerInfo = this.#workers.find(
      (data) => data.apiId === apiId && data.apiHash === apiHash
    );
    const index = this.#workers.indexOf(workerInfo);

    if (index > -1) {
      this.#workers[index].instance.terminate();
    }
  }

  deleteWorkerFromArray(apiId, apiHash) {
    const workerInfo = this.#workers.find(
      (data) => data.apiId === apiId && data.apiHash === apiHash
    );
    const index = this.#workers.indexOf(workerInfo);

    if (index > -1) {
      this.#workers.splice(index, 1);
    }
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
