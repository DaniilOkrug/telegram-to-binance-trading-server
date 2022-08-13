const { Schema, model } = require("mongoose");

const UserSchema = new Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: "User" }, // 0: Admin, 1: User
});

module.exports = model("User", UserSchema);
