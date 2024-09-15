const actionRegistry = require('./actionRegistry');
const logger = require('../logger');
const { validateParameters } = require('./actionUtils');

class ActionExecutor {
  constructor(bot, goalManager) {
    this.bot = bot;
    this.goalManager = goalManager;
    this.pausedActions = new Set();
  }

  stopCurrentAction() {
    if (this.currentAction) {
      logger.debug('ACTION', 'ActionExecutor', `Stopping current action: ${this.currentAction}`);
      this.stopSignal = true;
    }
  }

  async executeAction(actionName, parameters, shouldStop) {
    this.currentAction = actionName;
    this.stopSignal = false;
    try {
      const action = actionRegistry.getAction(actionName);
      if (!action) {
        throw new Error(`Unknown action type: ${actionName}`);
      }

      const validatedParams = validateParameters(actionName, parameters);
      logger.debug('ACTION', 'ActionExecutor', `Executing action: ${actionName}`, { parameters: validatedParams });

      const startTime = Date.now();
      const shouldStopOrPaused = () => shouldStop() || this.stopSignal || this.pausedActions.has(actionName);
      const result = await action.execute(validatedParams, this.bot, this.goalManager, shouldStopOrPaused);
      const endTime = Date.now();

      if (this.stopSignal) {
        logger.debug('ACTION', 'ActionExecutor', `Action ${actionName} interrupted`, { duration: `${endTime - startTime}ms` });
        return { interrupted: true, partialResult: result };
      }

      logger.debug('ACTION', 'ActionExecutor', `Action ${actionName} completed`, { duration: `${endTime - startTime}ms`, result });
      return result;
    } catch (error) {
      logger.error('ACTION', 'ActionExecutor', `Error executing action ${actionName}`, { error: error.message });
      throw error;
    } finally {
      this.currentAction = null;
      this.stopSignal = false;
    }
  }

  pauseAction(actionName) {
    this.pausedActions.add(actionName);
  }

  resumeAction(actionName) {
    this.pausedActions.delete(actionName);
  }

  interruptCurrentAction() {
    if (this.currentAction) {
      this.stopSignal = true;
      logger.debug('ACTION', 'ActionExecutor', `Interrupting current action: ${this.currentAction}`);
    }
  }
}

module.exports = ActionExecutor;
