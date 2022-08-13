const { Schema, model } = require("mongoose");

const BinanceAccountSchema = new Schema({
  user: { type: Schema.Types.ObjectId, red: "User" },
  key: { type: String, require: true },
  secret: { type: String, require: true },
});

module.exports = model("BinanceAccount", BinanceAccountSchema);
