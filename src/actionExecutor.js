const actionRegistry = require('./actionRegistry');
const logger = require('./logger');

async function executeActions(actions, shouldStop) {
  for (const [index, action] of actions.entries()) {
    if (shouldStop()) {
      logger.info('ActionExecutor', `Stopping execution of action sequence at action ${index + 1}/${actions.length}: ${action.type}`);
      break;
    }
    try {
      logger.info('ActionExecutor', `Executing action ${index + 1}/${actions.length}: ${action.type}`);
      await executeAction(action, shouldStop);
    } catch (error) {
      logger.error('ActionExecutor', `Error executing action ${index + 1}/${actions.length} (${action.type}): ${error.message}`);
      throw error;
    }
  }
}

async function executeAction(action, shouldStop) {
  logger.info('ActionExecutor', `Starting execution of action: ${action.type}`);
  logger.info('ActionExecutor', `Action parameters: ${JSON.stringify(action.parameters)}`);
  
  const startTime = Date.now();
  const actionFunction = actionRegistry[action.type];

  if (!actionFunction) {
    logger.error('ActionExecutor', `Unknown action type: ${action.type}`);
    throw new Error(`Unknown action type: ${action.type}`);
  }

  try {
    const result = await actionFunction(action.parameters, shouldStop);
    const endTime = Date.now();
    logger.info('ActionExecutor', `Action ${action.type} completed in ${endTime - startTime}ms`);
    
    if (result && result.stopped) {
      logger.info('ActionExecutor', `Action ${action.type} was stopped prematurely. ${result.collected ? `Collected ${result.collected} items.` : ''}`);
    }

    return result;
  } catch (error) {
    logger.error('ActionExecutor', `Error executing action ${action.type}: ${error.message}`);
    throw error;
  }
}

module.exports = { executeActions, executeAction };
