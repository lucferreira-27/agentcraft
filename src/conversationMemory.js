const { logger } = require('./utils');

class ConversationMemory {
  constructor(maxMemorySize = 10) {
    this.memory = [];
    this.maxMemorySize = maxMemorySize;
  }

  addEntry(username, message, response) {
    this.memory.push({ username, message, response, timestamp: new Date() });
    if (this.memory.length > this.maxMemorySize) {
      this.memory.shift(); // Remove the oldest entry
    }
    logger.debug(`Added new conversation entry. Memory size: ${this.memory.length}`);
  }

  getRecentConversation(count = this.maxMemorySize) {
    return this.memory.slice(-count);
  }

  clearMemory() {
    this.memory = [];
    logger.info('Cleared conversation memory');
  }

  getFormattedHistory() {
    return this.memory.map(entry => 
      `${entry.timestamp.toISOString()} - ${entry.username}: ${entry.message}\nAgent: ${entry.response.message}`
    ).join('\n\n');
  }
}

module.exports = ConversationMemory;