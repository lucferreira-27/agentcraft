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
      logger.info('ActionExecutor', `Stopping current action: ${this.currentAction}`);
      // Set a flag or use a method to stop the current action
      // This might involve setting a stop flag that the action checks periodically
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
      logger.info('ActionExecutor', `Executing action: ${actionName}`);
      logger.info('ActionExecutor', `Action parameters: ${JSON.stringify(validatedParams)}`);

      const startTime = Date.now();
      const result = await action.execute(validatedParams, this.bot, this.goalManager, () => shouldStop() || this.stopSignal);
      const endTime = Date.now();

      logger.info('ActionExecutor', `Action ${actionName} completed in ${endTime - startTime}ms`);
      return result;
    } finally {
      this.currentAction = null;
    }
  }
}

module.exports = ActionExecutor;
