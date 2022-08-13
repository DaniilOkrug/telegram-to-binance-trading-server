const Router = require('express').Router;
const { body } = require('express-validator');

const authMiddleware = require('../middleware/auth.middleware');
const UserController = require('../controllers/user.controller');
const TelegramController = require('../controllers/telegram.controller');
const BinanceController = require('../controllers/binance.controller');

const router = new Router();

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

router.get('/telegram/getAccount', authMiddleware, TelegramController.getAccount)
router.post('/telegram/connect', authMiddleware, TelegramController.connect);
router.post('/telegram/code', authMiddleware, TelegramController.code);

router.post('/binance/connect', authMiddleware, BinanceController.connect)



module.exports = router;