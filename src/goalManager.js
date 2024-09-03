const { logger } = require('./utils');

class Goal {
  constructor(action, args, priority = 1) {
    this.action = action;
    this.args = args;
    this.priority = priority;
    this.status = 'pending';
  }
}

class GoalManager {
  constructor() {
    this.goals = [];
    this.currentGoal = null;
    this.completedGoals = [];
    logger.info('GoalManager initialized');
  }

  addGoal(action, args, priority = 1) {
    const goal = new Goal(action, args, priority);
    this.goals.push(goal);
    this.goals.sort((a, b) => b.priority - a.priority);
    logger.info(`Added new goal: ${action} with priority ${priority}`);
    return goal;
  }

  async interruptCurrentGoal(actions) {
    if (this.currentGoal) {
      logger.info(`Interrupting current goal: ${this.currentGoal.action}`);
      this.currentGoal.status = 'interrupted';
      await actions.stopCurrentAction();
    }
  }

  async executeGoals(actions) {
    if (this.goals.length === 0 && !this.currentGoal) return;

    if (this.currentGoal && this.currentGoal.status === 'active') {
      await this.interruptCurrentGoal(actions);
    }

    try {
      if (!this.currentGoal && this.goals.length > 0) {
        this.currentGoal = this.goals.shift();
        this.currentGoal.status = 'active';
        logger.info(`Starting execution of goal: ${this.currentGoal.action}`);
      }

      if (!this.currentGoal) return;

      const success = await actions.executeAction(this.currentGoal.action, this.currentGoal.args);

      if (this.currentGoal) {
        if (this.currentGoal.status === 'clearing') {
          this.currentGoal = null;
        } else if (success) {
          this.currentGoal.status = 'completed';
          logger.info(`Goal ${this.currentGoal.action} completed successfully`);
        } else {
          this.currentGoal.status = 'failed';
          logger.info(`Goal ${this.currentGoal.action} failed`);
          this.handleGoalFailure(this.currentGoal);
        }
      }
    } catch (error) {
      logger.error(`Error executing goal ${this.currentGoal?.action}: ${error.message}`);
      if (this.currentGoal) {
        this.currentGoal.status = 'failed';
        this.handleGoalFailure(this.currentGoal);
      }
    } finally {
      if (this.currentGoal) {
        if (this.currentGoal.status !== 'clearing') {
          this.completedGoals.push(this.currentGoal);
        }
        this.currentGoal = null;
      }
    }

    setImmediate(() => this.executeGoals(actions));
  }

  handleGoalFailure(goal) {
    logger.info(`Goal ${goal.action} failed. No default recovery strategy.`);
  }

  getLastCompletedGoal() {
    return this.completedGoals[this.completedGoals.length - 1];
  }

  getRecentCompletedGoals(count = 5) {
    return this.completedGoals.slice(-count);
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
      if (this.currentGoal.status === 'active') {
        this.currentGoal.status = 'clearing';
      } else {
        this.currentGoal = null;
      }
    }
    logger.info('Cleared all goals');
  }
}

module.exports = GoalManager;