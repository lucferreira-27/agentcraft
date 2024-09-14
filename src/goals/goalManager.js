const Goal = require('./Goal');
const GoalQueue = require('./GoalQueue');
const ActionExecutor = require('../actions/ActionExecutor');
const logger = require('../logger');

const GoalAddOutcome = {
  ADDED: 'ADDED',
  UPDATED: 'UPDATED',
  IGNORED_COOLDOWN: 'IGNORED_COOLDOWN',
  IGNORED_ONGOING: 'IGNORED_ONGOING',
  STOPPED_EXISTING: 'STOPPED_EXISTING'
};

class GoalManager {
  constructor(bot) {
    this.goalQueue = new GoalQueue();
    this.isProcessing = false;
    this.currentGoal = null;
    this.ongoingActions = new Map(); // Track ongoing actions
    this.goalCooldowns = new Map(); // Track cooldowns for goal types
    this.actionExecutor = new ActionExecutor(bot);
  }

  /**
   * Add a new goal to the manager
   * @param {Object} goalData
   * @returns {Object} Result of adding the goal
   */
  addGoal(goalData) {
    const { intent, actions, priority } = goalData;
    const newGoal = new Goal(intent, actions, priority);

    if (this.isStopAction(actions[0])) {
      return this.handleStopAction(actions[0]);
    }

    if (this.isOngoingAction(actions[0])) {
      return this.handleOngoingAction(newGoal, actions[0]);
    }

    const existingGoal = this.findSimilarGoal(newGoal);
    if (existingGoal) {
      return this.handleExistingGoal(newGoal, existingGoal);
    }

    this.goalQueue.enqueue(newGoal);
    this.setGoalCooldown(intent);
    this.processGoals();
    this.logGoalState();

    return { outcome: GoalAddOutcome.ADDED, goal: newGoal };
  }

  /**
   * Check if an action is a stop action
   * @param {Object} action
   * @returns {boolean}
   */
  isStopAction(action) {
    return action.parameters && action.parameters.stop === true;
  }

  /**
   * Handle a stop action
   * @param {Object} action
   * @returns {Object} Result of handling the stop action
   */
  handleStopAction(action) {
    if (this.ongoingActions.has(action.type)) {
      const stoppedGoal = this.stopSpecificAction(action.type);
      return {
        outcome: GoalAddOutcome.STOPPED_EXISTING,
        goal: stoppedGoal
      };
    }
    return { outcome: GoalAddOutcome.IGNORED_ONGOING, goal: null };
  }

  /**
   * Check if an action is ongoing
   * @param {Object} action
   * @returns {boolean}
   */
  isOngoingAction(action) {
    return this.ongoingActions.has(action.type);
  }
  

  /**
   * Handle an ongoing action
   * @param {Goal} newGoal
   * @param {Object} action
   * @returns {Object} Result of handling the ongoing action
   */
  handleOngoingAction(newGoal, action) {
    const ongoingGoal = this.ongoingActions.get(action.type);

    if (action.type === 'followPlayer') {
      return this.handleOngoingFollowAction(newGoal, ongoingGoal, action);
    }

    return {
      outcome: GoalAddOutcome.IGNORED_ONGOING,
      goal: ongoingGoal
    };
  }

  /**
   * Handle an ongoing follow player action
   * @param {Goal} newGoal
   * @param {Goal} ongoingGoal
   * @param {Object} action
   * @returns {Object} Result of handling the ongoing follow action
   */
  handleOngoingFollowAction(newGoal, ongoingGoal, action) {
    const ongoingUsername = ongoingGoal.actions[0].parameters.username;
    const newUsername = action.parameters.username;

    if (ongoingUsername === newUsername) {
      this.updateOngoingFollowAction(ongoingGoal, action);
      return {
        outcome: GoalAddOutcome.UPDATED,
        goal: ongoingGoal
      };
    } else {
      const stoppedGoal = this.stopSpecificAction('followPlayer');
      this.goalQueue.enqueue(newGoal);
      return {
        outcome: GoalAddOutcome.UPDATED,
        goal: newGoal,
        replacedGoal: stoppedGoal
      };
    }
  }

  /**
   * Find a similar goal in the queue
   * @param {Goal} newGoal
   * @returns {Goal|undefined}
   */
  findSimilarGoal(newGoal) {
    return this.goalQueue.goals.find(goal => goal.isSimilarTo(newGoal));
  }

  /**
   * Handle an existing similar goal
   * @param {Goal} newGoal
   * @param {Goal} existingGoal
   * @returns {Object} Result of handling the existing goal
   */
  handleExistingGoal(newGoal, existingGoal) {
    if (newGoal.actions[0].type === 'followPlayer') {
      this.goalQueue.removeById(existingGoal.id);
      this.goalQueue.enqueue(newGoal);
      return {
        outcome: GoalAddOutcome.UPDATED,
        goal: newGoal,
        replacedGoal: existingGoal
      };
    }

    const cooldownTime = this.getGoalCooldown(newGoal.intent);
    if (Date.now() < cooldownTime) {
      return {
        outcome: GoalAddOutcome.IGNORED_COOLDOWN,
        goal: null
      };
    }
    this.goalQueue.removeById(existingGoal.id);
    this.goalQueue.enqueue(newGoal);
    return {
      outcome: GoalAddOutcome.UPDATED,
      goal: newGoal,
      replacedGoal: existingGoal
    };

  }

  /**
   * Update an ongoing follow player action
   * @param {Goal} ongoingGoal
   * @param {Object} newAction
   */
  updateOngoingFollowAction(ongoingGoal, newAction) {
    ongoingGoal.actions[0] = { ...ongoingGoal.actions[0], ...newAction };
    ongoingGoal.stopSignal = false;
    ongoingGoal.status = 'running';
    this.logGoalState();
  }

  /**
   * Set a cooldown for a goal intent
   * @param {string} intent
   * @param {number} [cooldownMs=5000]
   */
  setGoalCooldown(intent, cooldownMs = 5000) {
    this.goalCooldowns.set(intent, Date.now() + cooldownMs);
  }

  /**
   * Get the cooldown time for a goal intent
   * @param {string} intent
   * @returns {number}
   */
  getGoalCooldown(intent) {
    return this.goalCooldowns.get(intent) || 0;
  }

  /**
   * Process goals in the queue
   */
  async processGoals() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.goalQueue.length > 0) {
      const goal = this.goalQueue.dequeue();
      this.currentGoal = goal;
      goal.status = 'running';
      this.logGoalState();

      logger.info('GoalManager', `Starting execution of goal: ${goal.id} - ${goal.intent}`);

      try {
        await this.executeGoal(goal);
      } catch (error) {
        logger.error('GoalManager', `Failed to execute goal ${goal.id}: ${error.message}`);
        goal.status = 'failed';
      } finally {
        this.currentGoal = null;
        this.logGoalState();
      }
    }

    this.isProcessing = false;
    this.logGoalState();
  }

  /**
   * Execute a single goal
   * @param {Goal} goal
   */
  async executeGoal(goal) {
    goal.isRunning = true;
    for (const action of goal.actions) {
      if (goal.stopSignal) {
        goal.status = 'stopped';
        logger.info('GoalManager', `Goal ${goal.id} stopped prematurely`);
        break;
      }

      logger.info('GoalManager', `Executing action for goal ${goal.id}: ${action.type}`);
      this.ongoingActions.set(action.type, goal);

      try {
        const result = await this.actionExecutor.executeAction(action.type, action.parameters, () => goal.stopSignal);

        this.ongoingActions.delete(action.type);

        if (result && result.stopped) {
          logger.info('GoalManager', `Action ${action.type} was stopped prematurely. ${result.collected ? `Collected ${result.collected} items.` : ''}`);
          break;
        }

        if (action.type === 'followPlayer' && result.reason === 'reached_position') {
          logger.info('GoalManager', `Player reached, continuing to next action`);
          continue;
        }
      } catch (actionError) {
        logger.error('GoalManager', `Error executing action ${action.type} for goal ${goal.id}: ${actionError.message}`);
        continue;
      }

      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between actions
    }

    if (goal.status !== 'stopped') {
      goal.status = 'completed';
      logger.info('GoalManager', `Goal ${goal.id} completed successfully`);
    }
    goal.isRunning = false;
  }

  /**
   * Stop the current goal
   */
  stopCurrentGoal() {
    if (this.currentGoal && this.currentGoal.isRunning) {
      logger.info('GoalManager', `Stopping current goal: "${this.currentGoal.intent}"`);
      this.currentGoal.stopSignal = true;
      this.currentGoal.status = 'stopped';
      this.logGoalState();
    } else {
      logger.warn('GoalManager', 'No active goal to stop');
    }
  }

  /**
   * Stop a specific action
   * @param {string} actionType
   * @returns {Goal|null}
   */
  stopSpecificAction(actionType) {
    const goal = this.ongoingActions.get(actionType);
    if (goal) {
      logger.info('GoalManager', `Stopping specific action: ${actionType}`);
      goal.stopSignal = true;
      goal.status = 'stopped';
      this.ongoingActions.delete(actionType);
      this.logGoalState();
      return goal;
    } else {
      logger.warn('GoalManager', `No ongoing action of type ${actionType} to stop`);
      return null;
    }
  }

  /**
   * Log the current state of goals
   */
  logGoalState() {
    const state = this.getGoalState();
    logger.info('GoalManager', `Current Goal State:
      Queued Goals: ${state.queuedGoals}
      Current Goal: ${state.currentGoal ? `${state.currentGoal.intent} (Priority: ${state.currentGoal.priority}, Status: ${state.currentGoal.status})` : 'None'}
      Ongoing Actions: ${state.ongoingActions.join(', ') || 'None'}
      Total Goals: ${state.totalGoals}`);
  }

  /**
   * Get the current state of goals
   * @returns {Object}
   */
  getGoalState() {
    return {
      queuedGoals: this.goalQueue.length,
      currentGoal: this.currentGoal ? {
        intent: this.currentGoal.intent,
        priority: this.currentGoal.priority,
        status: this.currentGoal.status
      } : null,
      ongoingActions: Array.from(this.ongoingActions.keys()),
      totalGoals: this.goalQueue.length + (this.currentGoal ? 1 : 0)
    };
  }
}

module.exports = { GoalManager, GoalAddOutcome };