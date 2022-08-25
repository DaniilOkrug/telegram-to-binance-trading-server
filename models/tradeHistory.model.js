const { Schema, model } = require("mongoose");

const TradeHistoryShema = new Schema({
  user: { type: Schema.Types.ObjectId, red: "User" },
  pair: { type: String, required: true },
  openPrice: { type: String, required: true },
  side: { type: String, required: true },
  channelName: { type: String, required: true },
  profit: { type: Number, required: true },
  commission: { type: Number, reqired: true },
  timestamp: { type: Number, required: true },
});

module.exports = model("TradeHistory", TradeHistoryShema);
