const EventEmitter = require('events');
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const logger = require('./logger');
const memory = require('./memory');

class BotManager extends EventEmitter {
  constructor() {
    super();
    this.bot = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.isConnected = false;
  }

  createBot() {
    if (this.isConnected) {
      logger.warn('BOT', 'BotManager', 'Attempted to create a new bot while already connected');
      return;
    }

    logger.info('BOT', 'BotManager', 'Creating new bot instance');
    this.bot = mineflayer.createBot({
      host: process.env.MINECRAFT_HOST,
      port: parseInt(process.env.MINECRAFT_PORT),
      username: process.env.BOT_USERNAME,
      version: '1.20.1',
    });

    this.bot.loadPlugin(pathfinder);

    this.setupEventListeners();
    this.setupBotEventListeners();
    return this.bot;
  }

  setupEventListeners() {
    this.bot.once('spawn', () => {
      const info = { 
        position: this.bot.entity.position,
        username: this.bot.username
      }
      logger.info('BOT', 'BotManager', `[${info.username}] has spawned into the game`);
      const defaultMove = new Movements(this.bot);
      this.bot.pathfinder.setMovements(defaultMove);
      this.bot.chat('Hello! I am your AI companion. How can I assist you today?');
      this.emit('ready');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      this.emit('botReady', this.bot);
    });

    this.bot.on('error', (error) => {
      logger.error('BOT', 'BotManager', 'Minecraft bot error', { error });
      this.handleDisconnect('error');
    });

    this.bot.on('end', (reason) => {
      logger.warn('BOT', 'BotManager', 'Bot disconnected', { reason });
      this.handleDisconnect('end', reason);
    });

    this.bot.on('kicked', (reason, loggedIn) => {
      logger.warn('BOT', 'BotManager', 'Bot was kicked', { reason, loggedIn });
      this.handleDisconnect('kicked', reason);
    });

    // Add any other necessary event listeners here
  }

  setupBotEventListeners() {
    if (!this.bot) return;

    this.bot.on('chat', (username, message) => {
      if (username === this.bot.username) {
        logger.info('CHAT', 'Bot', `Bot sent message: "${message}"`);
      } else {
        logger.info('CHAT', 'Server', `${username}: "${message}"`);
        const chatHandler = require('./chatHandler');
        chatHandler.handleChat(username, message);
      }
    });

    this.bot.on('message', (jsonMsg) => {
      const plainText = jsonMsg.toAnsi();
      if (plainText.trim() !== '') {
        logger.debug('SERVER', 'Message', plainText);
      }
    });

    // Set up periodic state recording
    this.startPeriodicStateRecording();
  }

  startPeriodicStateRecording() {
    if (this.stateRecordingInterval) {
      clearInterval(this.stateRecordingInterval);
    }

    this.stateRecordingInterval = setInterval(() => {
      this.recordBotState();
    }, 5000);
  }

  recordBotState() {
    if (this.bot && this.bot.entity) {
      const state = {
        position: {
          x: this.bot.entity.position.x,
          y: this.bot.entity.position.y,
          z: this.bot.entity.position.z
        },
        health: this.bot.health,
        food: this.bot.food,
        gameTime: this.bot.time.age.toString(),
        inventory: this.bot.inventory.items().map(item => ({
          name: item.name,
          count: item.count
        }))
      };
      //logger.debug('BOT', 'State', 'Recorded bot state', { state });
      memory.recordState(state);
    }
  }

  handleDisconnect(event, reason = '') {
    this.isConnected = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.stateRecordingInterval) {
      clearInterval(this.stateRecordingInterval);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('BOT', 'BotManager', 'Max reconnection attempts reached. Stopping reconnection.');
      return;
    }

    const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, 30000); // Max delay of 30 seconds
    this.reconnectAttempts++;

    logger.info('BOT', 'BotManager', `Attempting to reconnect in ${delay}ms. Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    this.reconnectTimeout = setTimeout(() => {
      logger.info('BOT', 'BotManager', 'Reconnecting...');
      this.createBot();
    }, delay);
  }

  getBot() {
    return this.bot;
  }
}

const botManager = new BotManager();
module.exports = botManager;