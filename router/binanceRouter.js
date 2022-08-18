const Router = require('express').Router;

const authMiddleware = require('../middleware/auth.middleware');
const BinanceController = require('../controllers/binance.controller');

const binanceRouter = new Router();

binanceRouter.post('/connect', authMiddleware, BinanceController.connect);
binanceRouter.get('/getAccount', authMiddleware, BinanceController.getAccount);

module.exports = binanceRouter;