require('dotenv').config();
const botManager = require('./botManager');
const memory = require('./memory');
const logger = require('./logger');

const bot = botManager.createBot();

// Handle chat messages
bot.on('chat', (username, message) => {
  if (username === bot.username) {
    logger.info('CHAT', 'Bot', `Bot sent message: "${message}"`);
  } else {
    logger.info('CHAT', 'Server', `${username}: "${message}"`);
    const chatHandler = require('./chatHandler');
    chatHandler.handleChat(username, message);
  }
});

// Log other server messages
bot.on('message', (jsonMsg) => {
  const plainText = jsonMsg.toAnsi(); // Convert to plain text
  if (plainText.trim() !== '') {
    logger.debug('SERVER', 'Message', plainText);
  }
});

// Periodically update memory or perform background tasks
setInterval(() => {
  if (bot && bot.entity) {
    const state = {
      position: bot.entity.position,
      health: bot.health,
      inventory: bot.inventory.items().map(item => item.name),
      time: bot.time,
    };
    memory.recordState(state);
    logger.debug('BOT', 'State', 'Updated bot state', { state });
  }
}, 5000);

function recordBotState() {
  const bot = botManager.getBot();
  if (bot) {
    const state = {
      position: {
        x: bot.entity.position.x,
        y: bot.entity.position.y,
        z: bot.entity.position.z
      },
      health: bot.health,
      food: bot.food,
      gameTime: bot.time.age.toString(), // Convert potential BigInt to string
      inventory: bot.inventory.items().map(item => ({
        name: item.name,
        count: item.count
      }))
    };
    logger.debug('BOT', 'State', 'Recorded bot state', { state });
    Memory.recordState(state);
  }
}

module.exports = bot;