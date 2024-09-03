const winston = require('winston');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level}]: ${message}`;
      })
    ),
    transports: [
      new winston.transports.Console()
    ]
  });

module.exports = {
    sleep,
    logger
};