const actionRegistry = require('./actionRegistry');
const logger = require('../logger');
const { validateParameters } = require('./actionUtils');

class ActionExecutor {
  constructor(bot, goalManager) {
    this.bot = bot;
    this.goalManager = goalManager;
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
      const result = await action.execute(validatedParams, this.bot, this.goalManager, () => shouldStop() || this.stopSignal);
      const endTime = Date.now();

      logger.debug('ACTION', 'ActionExecutor', `Action ${actionName} completed`, { duration: `${endTime - startTime}ms`, result });
      return result;
    } catch (error) {
      logger.error('ACTION', 'ActionExecutor', `Error executing action ${actionName}`, { error: error.message });
      throw error;
    } finally {
      this.currentAction = null;
    }
  }
}

module.exports = ActionExecutor;
