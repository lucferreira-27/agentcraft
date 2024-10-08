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
    this.bot = bot;
    this.goalQueue = new GoalQueue();
    this.isProcessing = false;
    this.currentGoal = null;
    this.ongoingActions = new Map(); // Track ongoing actions
    this.goalCooldowns = new Map(); // Track cooldowns for goal types
    this.actionExecutor = new ActionExecutor(bot, this);
    this.pausedGoals = new Map(); // Track paused goals
    this.actionPauseMethods = new Map(); // Add this line
    logger.debug('GOAL', 'GoalManager', 'Goal Manager initialized');
  }

  /**
   * Add a new goal to the manager
   * @param {Object} goalData
   * @returns {Object} Result of adding the goal
   */
  addGoal(goalData) {
    const { intent, actions, priority } = goalData;
    const newGoal = new Goal(intent, actions, priority);

    if (this.hasHighPriorityAction(actions)) {
      return this.executeHighPriorityGoal(newGoal);
    }

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

    logger.debug('GOAL', 'GoalManager', `New goal added: ${newGoal.intent}`, { goalId: newGoal.id });
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

    while (this.goalQueue.length > 0 || this.pausedGoals.size > 0) {
      if (this.goalQueue.length === 0 && this.pausedGoals.size > 0) {
        // Resume the oldest paused goal
        const oldestPausedGoal = Array.from(this.pausedGoals.values()).sort((a, b) => a.timestamp - b.timestamp)[0];
        this.resumeGoal(oldestPausedGoal.id);
      }

      const goal = this.goalQueue.dequeue();
      this.currentGoal = goal;
      goal.status = 'running';
      this.logGoalState();

      logger.debug('GOAL', 'GoalManager', `Starting execution of goal: ${goal.intent}`, { goalId: goal.id });

      try {
        await this.executeGoal(goal);
      } catch (error) {
        logger.error('GOAL', 'GoalManager', `Failed to execute goal: ${goal.intent}`, { goalId: goal.id, error: error.message });
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
        logger.debug('GOAL', 'GoalManager', `Goal stopped prematurely: ${goal.intent}`, { goalId: goal.id });
        break;
      }

      logger.debug('GOAL', 'GoalManager', `Executing action for goal: ${goal.intent}`, { goalId: goal.id, actionType: action.type });
      this.ongoingActions.set(action.type, goal);

      try {
        const result = await this.actionExecutor.executeAction(action.type, action.parameters, () => goal.stopSignal);

        this.ongoingActions.delete(action.type);

        if (result && result.stopped) {
          logger.debug('GOAL', 'GoalManager', `Action stopped prematurely: ${action.type}`, { goalId: goal.id, collected: result.collected });
          break;
        }

        if (result && result.reason === 'max_attempts_reached') {
          logger.warn('GOAL', 'GoalManager', `Action reached max attempts: ${action.type}`, { goalId: goal.id });
          break;
        }

        if (action.type === 'followPlayer' && result.reason === 'reached_position') {
          logger.debug('GOAL', 'GoalManager', `Player reached, continuing to next action`, { goalId: goal.id });
          continue;
        }
      } catch (actionError) {
        logger.error('GOAL', 'GoalManager', `Error executing action: ${action.type}`, { goalId: goal.id, error: actionError.message });
        continue;
      }

      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between actions
    }

    if (goal.status !== 'stopped') {
      goal.status = 'completed';
      logger.info('GOAL', 'GoalManager', `Goal completed successfully: ${goal.intent}`);
    }
    goal.isRunning = false;
  }

  /**
   * Stop the current goal
   */
  stopCurrentGoal() {
    if (this.currentGoal && this.currentGoal.isRunning) {
      logger.info('GOAL', 'GoalManager', `Stopping current goal: "${this.currentGoal.intent}"`);
      this.currentGoal.stopSignal = true;
      this.currentGoal.status = 'stopped';
      // Interrupt the current action
      if (this.actionExecutor.currentAction) {
        this.actionExecutor.stopCurrentAction();
      }
      const stoppedGoal = this.currentGoal;
      this.currentGoal = null;
      this.isProcessing = false;
      this.logGoalState();
      return stoppedGoal;
    } else {
      logger.warn('GOAL', 'GoalManager', 'No active goal to stop');
      return null;
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
      logger.info('GOAL', 'GoalManager', `Stopping specific action: ${actionType}`);
      goal.stopSignal = true;
      goal.status = 'stopped';
      this.ongoingActions.delete(actionType);
      this.logGoalState();
      return goal;
    } else {
      logger.warn('GOAL', 'GoalManager', `No ongoing action of type ${actionType} to stop`);
      return null;
    }
  }

  /**
   * Log the current state of goals
   */
  logGoalState() {
    const state = this.getGoalState();
    logger.debug('GOAL', 'GoalManager', 'Current Goal State', {
      queuedGoals: state.queuedGoals,
      currentGoal: state.currentGoal ? `${state.currentGoal.intent} (Priority: ${state.currentGoal.priority}, Status: ${state.currentGoal.status})` : 'None',
      ongoingActions: state.ongoingActions.join(', ') || 'None',
      totalGoals: state.totalGoals
    });
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

  getCurrentGoals() {
    const currentGoals = [];
    if (this.currentGoal) {
      currentGoals.push({
        id: this.currentGoal.id,
        intent: this.currentGoal.intent,
        status: this.currentGoal.status
      });
    }
    this.goalQueue.goals.forEach(goal => {
      currentGoals.push({
        id: goal.id,
        intent: goal.intent,
        status: goal.status
      });
    });
    return currentGoals;
  }

  cancelGoalById(goalId) {
    logger.warn('GOAL', 'GoalManager', `'cancelGoalById' is deprecated. Use 'destroyGoal' instead.`);
    return this.destroyGoal(goalId);
  }

  executeCancelGoalAction(goalId) {
    logger.warn('GOAL', 'GoalManager', `'executeCancelGoalAction' is deprecated. Use 'destroyGoal' instead.`);
    const cancelledGoal = this.destroyGoal(goalId);
    return {
      outcome: cancelledGoal ? GoalAddOutcome.STOPPED_EXISTING : GoalAddOutcome.IGNORED_ONGOING,
      goal: cancelledGoal
    };
  }

  pauseGoal(goalId) {
    const goal = this.currentGoal && this.currentGoal.id === goalId ? this.currentGoal : this.goalQueue.removeById(goalId);
    if (goal) {
      goal.pause();
      this.pausedGoals.set(goalId, goal);
      logger.debug('GOAL', 'GoalManager', `Paused goal: ${goal.intent}`, { goalId });

      // Pause the current action if it's being paused
      if (this.currentGoal && this.currentGoal.id === goalId) {
        const currentAction = this.currentGoal.actions[0]; // Assuming the first action is the current one
        this.pauseAction(currentAction.type);
        this.actionExecutor.pauseAction(currentAction.type);
        this.currentGoal = null;
      }

      return goal;
    }
    return null;
  }

  resumeGoal(goalId) {
    const goal = this.pausedGoals.get(goalId);
    if (goal) {
      goal.resume();
      this.pausedGoals.delete(goalId);
      this.goalQueue.enqueue(goal);
      logger.debug('GOAL', 'GoalManager', `Resumed goal: ${goal.intent}`, { goalId });

      // Resume the action
      const currentAction = goal.actions[0]; // Assuming the first action is the one to resume
      this.resumeAction(currentAction.type);
      this.actionExecutor.resumeAction(currentAction.type);

      return goal;
    }
    return null;
  }

  destroyGoal(goalId) {
    let destroyedGoal = null;
    if (this.currentGoal && this.currentGoal.id === goalId) {
      destroyedGoal = this.currentGoal;
      this.currentGoal.stopSignal = true;
      this.actionExecutor.interruptCurrentAction();
      this.currentGoal = null;
      this.isProcessing = false;
      logger.debug('GOAL', 'GoalManager', `Destroyed current goal: ${goalId}`);
    } else {
      destroyedGoal = this.goalQueue.removeById(goalId) || this.pausedGoals.get(goalId);
      if (destroyedGoal) {
        this.pausedGoals.delete(goalId);
        logger.debug('GOAL', 'GoalManager', `Destroyed goal: ${destroyedGoal.intent}`, { goalId });
      }
    }
    return destroyedGoal;
  }

  executeHighPriorityAction(action) {
    switch (action.type) {
      case 'destroyGoal':
        return this.executeDestroyGoalAction(action.parameters.goalId);
      case 'pauseGoal':
        return this.executePauseGoalAction(action.parameters.goalId);
      case 'resumeGoal':
        return this.executeResumeGoalAction(action.parameters.goalId);
      default:
        throw new Error(`Unknown high-priority action: ${action.type}`);
    }
  }

  executeDestroyGoalAction(goalId) {
    const destroyedGoal = this.destroyGoal(goalId);
    return {
      outcome: destroyedGoal ? GoalAddOutcome.STOPPED_EXISTING : GoalAddOutcome.IGNORED_ONGOING,
      goal: destroyedGoal
    };
  }

  executePauseGoalAction(goalId) {
    const pausedGoal = this.pauseGoal(goalId);
    return {
      outcome: pausedGoal ? GoalAddOutcome.UPDATED : GoalAddOutcome.IGNORED_ONGOING,
      goal: pausedGoal
    };
  }

  executeResumeGoalAction(goalId) {
    const resumedGoal = this.resumeGoal(goalId);
    return {
      outcome: resumedGoal ? GoalAddOutcome.UPDATED : GoalAddOutcome.IGNORED_ONGOING,
      goal: resumedGoal
    };
  }

  hasHighPriorityAction(actions) {
    return actions.some(action => ['destroyGoal', 'pauseGoal', 'resumeGoal'].includes(action.type));
  }

  async executeHighPriorityGoal(goal) {
    let result = { outcome: GoalAddOutcome.ADDED, goal: null };
    for (const action of goal.actions) {
      if (['destroyGoal', 'pauseGoal', 'resumeGoal'].includes(action.type)) {
        result = this.executeHighPriorityAction(action);
        if (result.outcome !== GoalAddOutcome.UPDATED) {
          return result; // Stop if the high-priority action failed or was ignored
        }
      } else {
        // Execute non-high-priority actions immediately
        try {
          await this.actionExecutor.executeAction(action.type, action.parameters, () => false);
        } catch (error) {
          logger.error('GOAL', 'GoalManager', `Failed to execute action: ${action.type}`, { error: error.message });
        }
      }
    }
    return result;
  }

  registerActionPauseMethod(actionType, pauseMethod) {
    this.actionPauseMethods.set(actionType, pauseMethod);
  }

  pauseAction(actionType) {
    logger.debug('GOAL', 'GoalManager', `Pausing action: ${actionType}`);
    const pauseMethod = this.actionPauseMethods.get(actionType);
    if (pauseMethod) {
      pauseMethod();
    }
  }

  resumeAction(actionType) {
    logger.debug('GOAL', 'GoalManager', `Resuming action: ${actionType}`);
    const resumeMethod = this.actionPauseMethods.get(actionType);
    if (resumeMethod) {
      resumeMethod();
    }
  }
}

module.exports = { GoalManager, GoalAddOutcome };