const logger = require('./logger');

class Memory {
    constructor() {
      this.interactions = [];
      this.stateHistory = [];
      this.maxInteractions = 100;
      this.maxStateHistory = 100;
    }
  
    recordInteraction(interaction) {
      this.interactions.push(interaction);
      if (this.interactions.length > this.maxInteractions) {
        this.interactions.shift(); // Remove oldest interaction
      }
      logger.info('Memory', `Recorded interaction: ${JSON.stringify(interaction)}`);
    }
  
    getRecentInteractions(count = 5) {
      logger.info('Memory', `Retrieving ${count} recent interactions`);
      return this.interactions.slice(-count);
    }
  
    recordState(state) {
      const serializedState = this.serializeState(state);
      this.stateHistory.push(serializedState);
      if (this.stateHistory.length > this.maxStateHistory) {
        this.stateHistory.shift(); // Remove oldest state
      }
      //logger.info('Memory', `Recorded state: ${JSON.stringify(serializedState)}`);
    }
  
    getRecentStates(count = 5) {
      logger.info('Memory', `Retrieving ${count} recent states`);
      return this.stateHistory.slice(-count);
    }
  
    clearMemory() {
      this.interactions = [];
      this.stateHistory = [];
      logger.info('Memory', 'Memory cleared');
    }

    serializeState(state) {
      return JSON.parse(JSON.stringify(state, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ));
    }
  }
  
  const memory = new Memory();
  module.exports = memory;
