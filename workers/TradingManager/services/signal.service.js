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
    const isLong = this.isSignal(message, validationData.signalWordsLong);
    const isShort = this.isSignal(message, validationData.signalWordsShort);
    const signalPair = this.determineSignalPair(message, validationData.pairs);

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

  isSignal(message, signalWordsLong) {
    for (const word of signalWordsLong) {
      if (message.includes(word)) {
        return true;
      }
    }

    return false;
  }

  determineSignalPair(message, pairs) {
    for (const pair of pairs) {
      const USDT_index = pair.indexOf("USDT");
      const alternativePairFormat =
        pair.slice(0, USDT_index) + "/" + pair.slice(USDT_index);

      if (message.includes(pair) || message.includes(alternativePairFormat)) {
        return pair;
      }
    }
  }
}

module.exports = new SignalService();
