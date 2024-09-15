const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');

class Goal {
  /**
   * @param {string} intent
   * @param {Array} actions
   * @param {number} [priority=1]
   */
  constructor(intent, actions, priority = 1) {
    this.id = uuidv4();
    this.intent = intent;
    this.actions = actions;
    this.priority = priority;
    this.timestamp = Date.now();
    this.isRunning = false;
    this.stopSignal = false;
    this.status = 'queued'; // 'queued', 'running', 'paused', 'completed', 'failed', 'stopped'
    logger.debug('GOAL', 'Goal', `Created new goal: ${this.intent}`, { id: this.id, priority: this.priority });
  }

  /**
   * Check if this goal is similar to another goal
   * @param {Goal} otherGoal
   * @returns {boolean}
   */
  isSimilarTo(otherGoal) {
    if (this.actions.length !== otherGoal.actions.length) return false;
    
    for (let i = 0; i < this.actions.length; i++) {
      const thisAction = this.actions[i];
      const otherAction = otherGoal.actions[i];
      
      if (thisAction.type !== otherAction.type) return false;
      
      // For followPlayer action, check if it's for the same player
      if (thisAction.type === 'followPlayer' && 
          thisAction.parameters.username !== otherAction.parameters.username) {
        return false;
      }
    }
    
    logger.debug('GOAL', 'Goal', `Goal ${this.id} is similar to ${otherGoal.id}`);
    return true;
  }

  pause() {
    if (this.status === 'running') {
      this.status = 'paused';
      logger.debug('GOAL', 'Goal', `Goal paused: ${this.intent}`, { goalId: this.id });
    }
  }

  resume() {
    if (this.status === 'paused') {
      this.status = 'queued';
      logger.debug('GOAL', 'Goal', `Goal resumed: ${this.intent}`, { goalId: this.id });
    }
  }
}

module.exports = Goal;