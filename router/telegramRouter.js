const Router = require('express').Router;

const authMiddleware = require('../middleware/auth.middleware');
const TelegramController = require('../controllers/telegram.controller');

const telegramRouter = new Router();

telegramRouter.get('/getAccount', authMiddleware, TelegramController.getAccount);
telegramRouter.post('/connect', authMiddleware, TelegramController.connect);
telegramRouter.post('/code', authMiddleware, TelegramController.code); 


module.exports = telegramRouter;