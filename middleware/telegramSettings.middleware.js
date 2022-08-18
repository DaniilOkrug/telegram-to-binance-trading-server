class TelegramSettingsMiddleware {
    parseSignalWords(signalWords) {
        if (signalWords === '') return [];
    
        return signalWords.split(';').map(word => word.trim());
    }
}

module.exports = new TelegramSettingsMiddleware();