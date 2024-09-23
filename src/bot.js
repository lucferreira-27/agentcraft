require('dotenv').config();
const botManager = require('./botManager');

// Create the initial bot
botManager.createBot();

// Export the botManager instead of the bot
module.exports = botManager;