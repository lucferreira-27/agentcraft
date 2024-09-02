const { logger } = require('./utils');

class Goal {
  constructor(action, args, priority = 1) {
    this.action = action;
    this.args = args;
    this.priority = priority;
    this.status = 'pending'; // pending, active, completed, interrupted, failed
  }
}

class GoalManager {
  constructor() {
    this.goals = [];
    this.currentGoal = null;
  }

  addGoal(action, args, priority = 1) {
    const goal = new Goal(action, args, priority);
    this.goals.push(goal);
    this.goals.sort((a, b) => b.priority - a.priority);
    logger.info(`Added new goal: ${action}`);
    return goal;
  }

  async executeNextGoal(actions) {
    if (this.currentGoal && this.currentGoal.status === 'active') {
      logger.info(`Interrupting current goal: ${this.currentGoal.action}`);
      this.currentGoal.status = 'interrupted';
      await actions.stopCurrentAction();
    }
    
    if (this.goals.length === 0) {
      this.currentGoal = null;
      return;
    }

    this.currentGoal = this.goals.shift();
    this.currentGoal.status = 'active';
    logger.info(`Executing goal: ${this.currentGoal.action}`);

    try {
      await actions.executeAction(this.currentGoal.action, this.currentGoal.args);
      this.currentGoal.status = 'completed';
    } catch (error) {
      logger.error(`Error executing goal ${this.currentGoal.action}: ${error.message}`);
      this.currentGoal.status = 'failed';
    }

    this.currentGoal = null;
  }

  getCurrentGoal() {
    return this.currentGoal;
  }

  getAllGoals() {
    return [this.currentGoal, ...this.goals].filter(Boolean);
  }

  clearGoals() {
    this.goals = [];
    if (this.currentGoal) {
      this.currentGoal.status = 'interrupted';
    }
    this.currentGoal = null;
    logger.info('Cleared all goals');
  }
}

module.exports = GoalManager;