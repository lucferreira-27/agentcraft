class GoalQueue {
  constructor() {
    this.goals = [];
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
  }

  /**
   * Remove and return the next goal from the queue
   * @returns {Goal|undefined}
   */
  dequeue() {
    return this.goals.shift();
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
      return this.goals.splice(index, 1)[0];
    }
    return null;
  }
}

module.exports = GoalQueue;