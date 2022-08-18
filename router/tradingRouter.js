const Router = require('express').Router;

const authMiddleware = require('../middleware/auth.middleware');
const TradingController = require('../controllers/trading.controller');

const tradingRouter = new Router();

tradingRouter.get('/getChannels', authMiddleware, TradingController.getChannels);
tradingRouter.get('/getAccountStatus', authMiddleware, TradingController.getAccountStatus);
tradingRouter.post('/addChannel', authMiddleware, TradingController.addChannel);
tradingRouter.post('/deleteChannel', authMiddleware, TradingController.deleteChannel);
tradingRouter.post('/stopChannel', authMiddleware, TradingController.stopChannel);


module.exports = tradingRouter;