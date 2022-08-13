const { Schema, model } = require("mongoose");

const TelegramAccountSchema = new Schema({
  user: { type: Schema.Types.ObjectId, red: "User" },
  apiId: { type: String, require: true },
  apiHash: { type: String, require: true },
  phoneNumber: { type: String, require: true },
  sessionToken: { type: String, require: true },
});

module.exports = model("TelegramAccount", TelegramAccountSchema);
