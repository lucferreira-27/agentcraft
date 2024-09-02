const winston = require('winston');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'agent.log' })
    ]
});

module.exports = {
    sleep,
    logger
};