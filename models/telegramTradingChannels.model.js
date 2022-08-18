const { Schema, model } = require("mongoose");

const TakeProfitShema = new Schema({
  offset: { type: String, required: true }, //Percent
  amount: { type: Number, required: true },
});

const StopLossShema = new Schema({
  offset: { type: String, required: true }, //Percent
  amount: { type: Number, required: true },
});

const TelegramTradingChannelsShema = new Schema({
  user: { type: Schema.Types.ObjectId, red: "User" },
  status: { type: String, required: true },

  telegramSettings: {
    channelName: { type: String, required: true },
    signalWordsLong: { type: [String], required: true },
    signalWordsShort: { type: [String], required: true },
  },

  binanceSettings: {
    leverage: { type: Number, required: true },
    positionSize: { type: Number, required: true }, //in dollars
    tps: { type: [TakeProfitShema], required: true },
    sls: { type: [StopLossShema], required: true },
  },
});

module.exports = model("TelegramTradingChannels", TelegramTradingChannelsShema);
