const logger = require('../logger');

class GoalQueue {
  constructor() {
    this.goals = [];
    logger.debug('GOAL', 'GoalQueue', 'Goal Queue initialized');
  }

  /**
   * Add a goal to the queue
   * @param {Goal} goal
   */
  enqueue(goal) {
    if (this.goals.length === 0) {
      this.goals.push(goal);
    } else {
      // Insert goal based on priority
      let inserted = false;
      for (let i = 0; i < this.goals.length; i++) {
        if (goal.priority > this.goals[i].priority) {
          this.goals.splice(i, 0, goal);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        this.goals.push(goal);
      }
    }
    logger.debug('GOAL', 'GoalQueue', `Goal enqueued: ${goal.intent}`, { goalId: goal.id, queueLength: this.goals.length });
  }

  /**
   * Remove and return the next goal from the queue
   * @returns {Goal|undefined}
   */
  dequeue() {
    const goal = this.goals.shift();
    if (goal) {
      logger.debug('GOAL', 'GoalQueue', `Goal dequeued: ${goal.intent}`, { goalId: goal.id, queueLength: this.goals.length });
    }
    return goal;
  }

  /**
   * Get the number of goals in the queue
   * @returns {number}
   */
  get length() {
    return this.goals.length;
  }

  /**
   * Find a goal by its ID and remove it from the queue
   * @param {string} goalId
   * @returns {Goal|undefined}
   */
  removeById(goalId) {
    const index = this.goals.findIndex(goal => goal.id === goalId);
    if (index !== -1) {
      const removedGoal = this.goals.splice(index, 1)[0];
      logger.debug('GOAL', 'GoalQueue', `Goal removed by ID: ${removedGoal.intent}`, { goalId: removedGoal.id, queueLength: this.goals.length });
      return removedGoal;
    }
    logger.debug('GOAL', 'GoalQueue', `No goal found with ID: ${goalId}`);
    return null;
  }
}

module.exports = GoalQueue;