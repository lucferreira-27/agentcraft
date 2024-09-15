const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const util = require('util');

class Logger {
  constructor(options = {}) {
    this.logLevels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };
    this.minLevel = this.logLevels[options.minLevel] && this.logLevels.INFO;
    this.logToFile = options.logToFile || false;
    this.logFilePath = options.logFilePath || path.join(__dirname, '../logs/bot.log');
    this.categories = options.categories || ['DEFAULT'];
    this.enabledCategories = new Set(this.categories);

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

  formatMessage(level, category, module, message, data) {
    const timestamp = new Date().toISOString();
    const coloredLevel = this.getColoredLevel(level);
    const coloredCategory = chalk.magenta(`[${category}]`);
    const formattedMessage = `${chalk.gray(timestamp)} ${coloredLevel} ${coloredCategory} ${chalk.cyan(`[${module}]`)} ${message}`;
    
    if (data !== undefined) {
      const formattedData = this.formatData(data);
      return `${formattedMessage}\n${formattedData}`;
    }
    
    return formattedMessage;
  }

  formatData(data) {
    return util.inspect(data, { colors: true, depth: null, breakLength: 80 });
  }

  getColoredLevel(level) {
    switch (level) {
      case 'DEBUG': return chalk.blue('[DEBUG]');
      case 'INFO': return chalk.green('[INFO] ');
      case 'WARN': return chalk.yellow('[WARN] ');
      case 'ERROR': return chalk.red('[ERROR]');
      default: return chalk.white(`[${level}]`);
    }
  }

  log(level, category, module, message, data) {
    if (this.logLevels[level] >= this.minLevel && this.enabledCategories.has(category)) {
      const formattedMessage = this.formatMessage(level, category, module, message, data);
      console.log(formattedMessage);

      if (this.logToFile) {
        const plainMessage = this.formatPlainMessage(level, category, module, message, data);
        fs.appendFileSync(this.logFilePath, plainMessage + '\n');
      }
    }
  }

  formatPlainMessage(level, category, module, message, data) {
    const timestamp = new Date().toISOString();
    let plainMessage = `[${timestamp}] [${level}] [${category}] [${module}] ${message}`;
    if (data !== undefined) {
      plainMessage += '\n' + util.inspect(data, { depth: null, breakLength: 80 });
    }
    return plainMessage;
  }

  debug(category, module, message, data) { this.log('DEBUG', category, module, message, data); }
  info(category, module, message, data) { this.log('INFO', category, module, message, data); }
  warn(category, module, message, data) { this.log('WARN', category, module, message, data); }
  error(category, module, message, data) { this.log('ERROR', category, module, message, data); }

  setLogLevel(level) {
    if (this.logLevels.hasOwnProperty(level)) {
      this.minLevel = this.logLevels[level];
      this.info('SYSTEM', 'Logger', `Log level set to ${chalk.bold(level)}`);
    } else {
      this.warn('SYSTEM', 'Logger', `Invalid log level: ${chalk.bold(level)}`);
    }
  }

  enableCategory(category) {
    this.enabledCategories.add(category);
  }

  disableCategory(category) {
    this.enabledCategories.delete(category);
  }
}

const logLevel = process.env.LOG_LEVEL || 'DEBUG';
const logCategories = ['SYSTEM', 'BOT', 'AI', 'GOAL', 'ACTION', 'CHAT'];

module.exports = new Logger({
  minLevel:  logLevel,
  logToFile: true,
  categories: logCategories
});