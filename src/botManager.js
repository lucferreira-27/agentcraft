const EventEmitter = require('events');
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const logger = require('./logger');

class BotManager extends EventEmitter {
  constructor() {
    super();
    this.bot = null;
  }

  createBot() {
    logger.info('BotManager', 'Creating new bot instance');
    this.bot = mineflayer.createBot({
      host: process.env.MINECRAFT_HOST,
      port: parseInt(process.env.MINECRAFT_PORT),
      username: process.env.BOT_USERNAME,
      version: '1.20.1',
    });

    this.bot.loadPlugin(pathfinder);

    this.bot.once('spawn', () => {
      logger.info('BotManager', 'Bot has spawned into the game');
      const defaultMove = new Movements(this.bot);
      this.bot.pathfinder.setMovements(defaultMove);
      this.bot.chat('Hello! I am your AI companion. How can I assist you today?');
      this.emit('ready');
    });

    this.bot.on('error', (error) => {
      logger.error('BotManager', `Minecraft bot error: ${error.message}`);
    });

    return this.bot;
  }

  getBot() {
    return this.bot;
  }
}

const botManager = new BotManager();
module.exports = botManager;