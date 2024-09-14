const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.logLevels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };
    this.minLevel = this.logLevels[options.minLevel] || this.logLevels.INFO;
    this.logToFile = options.logToFile || false;
    this.logFilePath = options.logFilePath || path.join(__dirname, '../logs/bot.log');

    if (this.logToFile) {
      this.ensureLogDirectoryExists();
    }
  }

  ensureLogDirectoryExists() {
    const logDir = path.dirname(this.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  formatMessage(level, module, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${module}] ${message}`;
  }

  log(level, module, message) {
    if (this.logLevels[level] >= this.minLevel) {
      const formattedMessage = this.formatMessage(level, module, message);
      console.log(formattedMessage);

      if (this.logToFile) {
        fs.appendFileSync(this.logFilePath, formattedMessage + '\n');
      }
    }
  }

  debug(module, message) { this.log('DEBUG', module, message); }
  info(module, message) { this.log('INFO', module, message); }
  warn(module, message) { this.log('WARN', module, message); }
  error(module, message) { this.log('ERROR', module, message); }

  setLogLevel(level) {
    if (this.logLevels.hasOwnProperty(level)) {
      this.minLevel = this.logLevels[level];
      this.info('Logger', `Log level set to ${level}`);
    } else {
      this.warn('Logger', `Invalid log level: ${level}`);
    }
  }
}

const logLevel = process.env.LOG_LEVEL || 'DEBUG';
module.exports = new Logger({ minLevel: logLevel, logToFile: true });