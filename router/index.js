const Router = require('express').Router;
const { body } = require('express-validator');

const UserController = require('../controllers/user.controller');

const telegramRouter = require('./telegramRouter');
const binanceRouter = require('./binanceRouter');
const tradingRouter = require('./tradingRouter');

const router = new Router();

router.use('/telegram', telegramRouter);
router.use('/binance', binanceRouter);
router.use('/trading', tradingRouter);

router.get('/', () => { return "It's bot service!"});

//Client router
router.get('/logout', UserController.logout);
router.get('/refresh', UserController.refresh);

router.post('/registration',
    body('email').isEmail(),
    body('password').isLength({ min: 8, max: 32 }),
    UserController.registration
);
router.post('/login', UserController.login);

module.exports = router;