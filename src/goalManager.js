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
    this.completedGoals = [];
  }

  addGoal(action, args, priority = 1) {
    const goal = new Goal(action, args, priority);
    this.goals.push(goal);
    this.goals.sort((a, b) => b.priority - a.priority);
    logger.info(`Added new goal: ${action}`);
    return goal;
  }

  async interruptCurrentGoal(actions) {
    if (this.currentGoal) {
      logger.info(`Interrupting current goal: ${this.currentGoal.action}`);
      this.currentGoal.status = 'interrupted';
      await actions.stopCurrentAction();
    } else {
      logger.warn('No current goal to interrupt');
    }
  }

  async executeGoals(actions) {
    if (this.goals.length === 0 && !this.currentGoal) {
      logger.debug('No goals to execute');
      return;
    }

    if (this.currentGoal && this.currentGoal.status === 'active') {
      await this.interruptCurrentGoal(actions);
    }

    try {
      if (!this.currentGoal && this.goals.length > 0) {
        this.currentGoal = this.goals.shift();
        this.currentGoal.status = 'active';
        logger.info(`Starting execution of goal: ${this.currentGoal.action}`);
      }

      if (!this.currentGoal) {
        logger.debug('No current goal to execute');
        return;
      }

      const success = await actions.executeAction(this.currentGoal.action, this.currentGoal.args);

      if (this.currentGoal) {
        if (this.currentGoal.status === 'clearing') {
          logger.debug(`Clearing goal ${this.currentGoal.action} after execution`);
          this.currentGoal = null;
        } else if (success) {
          this.currentGoal.status = 'completed';
          logger.info(`Goal ${this.currentGoal.action} completed successfully`);
        } else {
          this.currentGoal.status = 'failed';
          logger.warn(`Goal ${this.currentGoal.action} was not achieved`);
          this.handleGoalFailure(this.currentGoal);
        }
      } else {
        logger.warn('Current goal became null during execution');
      }
    } catch (error) {
      logger.error(`Error executing goal ${this.currentGoal?.action}: ${error.message}`);
      logger.debug(`Stack trace: ${error.stack}`);
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

  async checkGoalSuccess(goal) {
    // Implement logic to verify if the goal was achieved
    // This could involve checking the agent's state, inventory, or the environment
    // For example:
    if (goal.action === 'collectBlock') {
      const blockType = goal.args[0];
      const collectedCount = this.agent.bot.inventory.items().find(item => item.name === blockType)?.count || 0;
      return collectedCount > 0; // Check if at least one block of the type was collected
    }
    // Add more checks for other goal types as needed
    return false; // Default to false if no specific check is implemented
  }

  handleGoalFailure(goal) {
    logger.warn(`Goal ${goal.action} failed. No default recovery strategy.`);
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
        // If the current goal is active, mark it for clearing after execution
        this.currentGoal.status = 'clearing';
      } else {
        this.currentGoal = null;
      }
    }
    logger.debug('Cleared all goals');
  }
}

module.exports = GoalManager;