const actionRegistry = require('./actionRegistry');
const logger = require('../logger');
const { validateParameters } = require('./actionUtils');

class ActionExecutor {
  constructor(bot) {
    this.bot = bot;
  }

  async executeAction(actionName, parameters, shouldStop) {
    try {
      const action = actionRegistry.getAction(actionName);
      if (!action) {
        throw new Error(`Unknown action type: ${actionName}`);
      }

      const validatedParams = validateParameters(actionName, parameters);
      logger.info('ActionExecutor', `Executing action: ${actionName}`);
      logger.info('ActionExecutor', `Action parameters: ${JSON.stringify(validatedParams)}`);

      const startTime = Date.now();
      const result = await action.execute(validatedParams, shouldStop);
      const endTime = Date.now();

      logger.info('ActionExecutor', `Action ${actionName} completed in ${endTime - startTime}ms`);
      return result;
    } catch (error) {
      logger.error('ActionExecutor', `Error executing action ${actionName}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ActionExecutor;
