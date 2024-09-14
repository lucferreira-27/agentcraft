const ActionExecutor = require('./actionExecutor');
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');

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
}

class GoalManager {
  constructor() {
    this.goals = [];
    this.isProcessing = false;
    this.currentGoal = null;
    this.ongoingActions = new Map(); // Track ongoing actions
  }

  addGoal(goalData) {
    const { intent, actions, priority } = goalData;
    const newGoal = new Goal(intent, actions, priority);
    this.enqueueGoal(newGoal);
    this.processGoals();
    this.logGoalState();
    logger.info('GoalManager', `New goal added: ${newGoal.id} - ${newGoal.intent}`);
    logger.info('GoalManager', `Goal details: ${JSON.stringify(newGoal)}`);
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
          
          const result = await ActionExecutor.executeAction(action, () => goal.stopSignal);
          
          this.ongoingActions.delete(action.type);

          if (result && result.stopped) {
            logger.info('GoalManager', `Action ${action.type} was stopped prematurely`);
            break;
          }

          // Check if the next action should be executed immediately
          if (i < goal.actions.length - 1 && action.type === 'followPlayer' && result.reached) {
            logger.info('GoalManager', `Player reached, continuing to next action`);
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
    } else {
      logger.warn('GoalManager', `No ongoing action of type ${actionType} to stop`);
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
      Current Goal: ${state.currentGoal ? `${state.currentGoal.id} - ${state.currentGoal.intent} (Priority: ${state.currentGoal.priority}, Status: ${state.currentGoal.status})` : 'None'}
      Ongoing Actions: ${state.ongoingActions.join(', ') || 'None'}
      Total Goals: ${state.totalGoals}`);
  }
}

const goalManager = new GoalManager();
module.exports = goalManager;