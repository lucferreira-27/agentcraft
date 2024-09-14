const ActionExecutor = require('./actionExecutor');
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');

// Define goal addition outcome types
const GoalAddOutcome = {
  ADDED: 'ADDED',
  UPDATED: 'UPDATED',
  IGNORED_COOLDOWN: 'IGNORED_COOLDOWN',
  IGNORED_ONGOING: 'IGNORED_ONGOING',
  STOPPED_EXISTING: 'STOPPED_EXISTING'
};

class Goal {
  constructor(intent, actions, priority = 1) {
    this.id = uuidv4();
    this.intent = intent;
    this.actions = actions;
    this.priority = priority;
    this.timestamp = Date.now();
    this.isRunning = false;
    this.stopSignal = false;
    this.status = 'queued'; // 'queued', 'running', 'completed', 'failed', 'stopped'
  }

  // New method to check if two goals are similar
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
    
    return true;
  }
}

class GoalManager {
  constructor() {
    this.goals = [];
    this.isProcessing = false;
    this.currentGoal = null;
    this.ongoingActions = new Map(); // Track ongoing actions
    this.goalCooldowns = new Map(); // Track cooldowns for goal types
  }

  isStopAction(action) {
    return action.parameters && action.parameters.stop === true;
  }

  addGoal(goalData) {
    const { intent, actions, priority } = goalData;
    const newGoal = new Goal(intent, actions, priority);

    // Check if the first action is a stop command for an ongoing action
    if (actions[0] && this.isStopAction(actions[0])) {
      const actionType = actions[0].type;
      if (this.ongoingActions.has(actionType)) {
        logger.info('GoalManager', `Received stop command for ongoing action: ${actionType}`);
        const stoppedGoal = this.stopSpecificAction(actionType);
        return {
          outcome: GoalAddOutcome.STOPPED_EXISTING,
          goal: stoppedGoal
        };
      }
    }

    // Check if there's an ongoing action of the same type
    if (actions[0] && this.ongoingActions.has(actions[0].type)) {
      const ongoingAction = this.ongoingActions.get(actions[0].type);
      const ongoingActionType = ongoingAction.actions[0].type;

      if (actions[0].type === 'followPlayer') {
        const ongoingUsername = ongoingAction.actions[0].parameters.username;
        const newUsername = actions[0].parameters.username;

        if (ongoingUsername === newUsername) {
          // If it's the same player, update the ongoing action's parameters
          this.updateOngoingFollowAction(ongoingAction, actions[0]);
          logger.info('GoalManager', `Updated ongoing followPlayer action for ${newUsername}`);
          return {
            outcome: GoalAddOutcome.UPDATED,
            goal: ongoingAction
          };
        } else {
          // If it's a different player, stop the current follow action and add the new one
          const stoppedGoal = this.stopSpecificAction('followPlayer');
          logger.info('GoalManager', `Stopped ongoing followPlayer action for ${ongoingUsername}`);
          // Continue to add the new goal
        }
      } else {
        logger.info('GoalManager', `Ongoing action of type ${ongoingActionType} exists. New goal not added.`);
        return {
          outcome: GoalAddOutcome.IGNORED_ONGOING,
          goal: ongoingAction
        };
      }
    }

    // Check for similar existing goals
    const existingGoalIndex = this.goals.findIndex(goal => goal.isSimilarTo(newGoal));

    if (existingGoalIndex !== -1) {
      // For followPlayer action, replace the existing goal
      if (actions[0].type === 'followPlayer') {
        const replacedGoal = this.goals.splice(existingGoalIndex, 1)[0];
        this.enqueueGoal(newGoal);
        logger.info('GoalManager', `Replaced existing followPlayer goal for ${actions[0].parameters.username}`);
        logger.debug('GoalManager', `Replaced goal details: ${JSON.stringify(replacedGoal)}`);
        return {
          outcome: GoalAddOutcome.UPDATED,
          goal: newGoal,
          replacedGoal: replacedGoal
        };
      } else {
        // For other actions, check cooldown
        const cooldownTime = this.getGoalCooldown(intent);
        if (Date.now() < cooldownTime) {
          logger.info('GoalManager', `Ignored duplicate goal: ${intent} (in cooldown)`);
          return {
            outcome: GoalAddOutcome.IGNORED_COOLDOWN,
            goal: null
          };
        }
      }
    }

    this.enqueueGoal(newGoal);
    this.setGoalCooldown(intent);
    this.processGoals();
    this.logGoalState();
    logger.info('GoalManager', `New goal added: ${newGoal.id} - ${newGoal.intent}`);
    logger.debug('GoalManager', `Goal details: ${JSON.stringify(newGoal)}`);
    return {
      outcome: GoalAddOutcome.ADDED,
      goal: newGoal
    };
  }

  updateOngoingFollowAction(ongoingGoal, newAction) {
    ongoingGoal.actions[0] = { ...ongoingGoal.actions[0], ...newAction };
    ongoingGoal.stopSignal = false; // Reset stop signal in case it was set
    ongoingGoal.status = 'running'; // Ensure the status is set to running
    this.logGoalState();
  }

  enqueueGoal(goal) {
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
    this.logGoalState();
  }

  setGoalCooldown(intent, cooldownMs = 5000) {
    this.goalCooldowns.set(intent, Date.now() + cooldownMs);
  }

  getGoalCooldown(intent) {
    return this.goalCooldowns.get(intent) || 0;
  }

  async processGoals() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.goals.length > 0) {
      const goal = this.goals.shift();
      this.currentGoal = goal;
      goal.status = 'running';
      this.logGoalState();

      logger.info('GoalManager', `Starting execution of goal: ${goal.id} - ${goal.intent}`);

      try {
        goal.isRunning = true;
        for (let i = 0; i < goal.actions.length; i++) {
          const action = goal.actions[i];
          if (goal.stopSignal) {
            goal.status = 'stopped';
            logger.info('GoalManager', `Goal ${goal.id} stopped prematurely`);
            break;
          }
          
          logger.info('GoalManager', `Executing action for goal ${goal.id}: ${action.type}`);
          this.ongoingActions.set(action.type, goal);
          
          try {
            const result = await ActionExecutor.executeAction(action, () => goal.stopSignal);
            
            this.ongoingActions.delete(action.type);

            if (result && result.stopped) {
              logger.info('GoalManager', `Action ${action.type} was stopped prematurely. ${result.collected ? `Collected ${result.collected} items.` : ''}`);
              break;
            }

            // Check if the next action should be executed immediately
            if (i < goal.actions.length - 1 && action.type === 'followPlayer' && result.reached) {
              logger.info('GoalManager', `Player reached, continuing to next action`);
              continue;
            }
          } catch (actionError) {
            logger.error('GoalManager', `Error executing action ${action.type} for goal ${goal.id}: ${actionError.message}`);
            // Here you could implement logic to retry the action or skip to the next one
            // For now, we'll just continue to the next action
            continue;
          }

          // Add a small delay between actions
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (goal.status !== 'stopped') {
          goal.status = 'completed';
          logger.info('GoalManager', `Goal ${goal.id} completed successfully`);
        }
      } catch (error) {
        logger.error('GoalManager', `Failed to execute goal ${goal.id}: ${error.message}`);
        goal.status = 'failed';
      } finally {
        goal.isRunning = false;
        this.currentGoal = null;
        this.logGoalState();
      }
    }

    this.isProcessing = false;
    this.logGoalState();
  }

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

  getGoalState() {
    return {
      queuedGoals: this.goals.length,
      currentGoal: this.currentGoal ? {
        intent: this.currentGoal.intent,
        priority: this.currentGoal.priority,
        status: this.currentGoal.status
      } : null,
      ongoingActions: Array.from(this.ongoingActions.keys()),
      totalGoals: this.goals.length + (this.currentGoal ? 1 : 0)
    };
  }

  logGoalState() {
    const state = this.getGoalState();
    logger.info('GoalManager', `Current Goal State:
      Queued Goals: ${state.queuedGoals}
      Current Goal: ${state.currentGoal ? `${state.currentGoal.intent} (Priority: ${state.currentGoal.priority}, Status: ${state.currentGoal.status})` : 'None'}
      Ongoing Actions: ${state.ongoingActions.join(', ') || 'None'}
      Total Goals: ${state.totalGoals}`);
  }
      
}

const goalManager = new GoalManager();
module.exports = { goalManager, GoalAddOutcome };