const TelegramSettingsMiddleWare = require("../../../middleware/telegramSettings.middleware");

class SignalService {
  /**
   * Определяет является ли сообщение сигналом
   *
   * @param {string} message
   * @param {{
   *      signalWordsLong: string;
   *      signalWordsShort: string;
   *      pairs: [string];
   * }} validationData
   *
   * @returns
   */
  determineSignal(message, validationData) {
    const isClose = this.isSignal(message, validationData.closeWords);
    const isLong = this.isSignal(message, validationData.signalWordsLong);
    const isShort = this.isSignal(message, validationData.signalWordsShort);
    const signalPair = this.determineSignalPair(message, validationData.pairs);

    if (isClose) {
      return {
        isSignal: true,
        isClose: true,
        symbol: signalPair,
      };
    }

    if ((isLong || isShort) && signalPair) {
      return {
        isSignal: true,
        symbol: signalPair,
        side: isLong ? "BUY" : "SELL",
        positionSide: isLong ? "LONG" : "SHORT",
      };
    } else {
      return {
        isSignal: false,
      };
    }
  }

  isSignal(message, words) {
    if (words.length === 0) return false;

    const wordsArr = Array.isArray(words)
      ? words
      : TelegramSettingsMiddleWare.parseSignalWords(words);

    for (const word of wordsArr) {
      if (message.includes(word)) {
        return true;
      }
    }

    return false;
  }

  determineSignalPair(message, pairs) {
    for (const pair of pairs) {
      const USDT_index = pair.indexOf("USDT");
      const coin = pair.slice(0, USDT_index);
      const usdt = pair.slice(USDT_index);

      const alternativePairFormat = coin + "/" + usdt;

      if (message.includes(pair) || message.includes(alternativePairFormat) || message.includes(coin)) {
        return pair;
      }
    }
  }
}

module.exports = new SignalService();
