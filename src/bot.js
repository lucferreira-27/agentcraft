require('dotenv').config();
const botManager = require('./botManager');
const memory = require('./memory');
const logger = require('./logger');

const bot = botManager.createBot();

// Handle chat messages
bot.on('chat', (username, message) => {
  if (username === bot.username) return; // Ignore messages from the bot itself
  logger.info('Bot', `Received chat message from ${username}: ${message}`);
  const chatHandler = require('./chatHandler');
  chatHandler.handleChat(username, message);
});

// Periodically update memory or perform background tasks
setInterval(() => {
  if (bot && bot.entity) {
    //logger.info('Bot', 'Updating memory with current state');
    // Example: Update memory with current state
    memory.recordState({
      position: bot.entity.position,
      health: bot.health,
      inventory: bot.inventory.items().map(item => item.name),
      time: bot.time,
    });
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
    Memory.recordState(state);
  }
}

module.exports = bot;