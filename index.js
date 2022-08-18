require('dotenv').config();
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require('cors');

const router = require('./router/index');
const errorMiddleware = require('./middleware/error.middleware');
const TradingService = require('./services/trading.service');

const PORT = process.env.PORT || 5000;

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    credentials: true,
    origin: process.env.ORIGIN,
    optionSuccessStatus: 200
}));

app.use('/api', router);
app.use(errorMiddleware);

const start = async () => {
    try {
        mongoose.connect(process.env.DB_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        server.listen(PORT, () => console.log(`Server started on PORT = ${PORT}`));

        TradingService.startBotsFromDB();
    } catch (e) {
        console.log(e);
    }
}

start();