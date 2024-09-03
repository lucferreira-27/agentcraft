const { logger } = require('./utils');
const { registry } = require('./actionRegistry');
const registerAllActions = require('./actions/index');
const { genericLabels } = require('./blockLabels');

class Actions {
  constructor(bot, goalManager, agent) {
    this.bot = bot;
    this.goalManager = goalManager;
    this.agent = agent;
    logger.info('Actions instance created');
    this.registerActions();
    logger.debug(`Actions registered: ${registry.getAll().map(action => action.name).join(', ')}`);
  }

  registerActions() {
    registerAllActions(registry, this.bot, this.goalManager, this.agent);
  }

  async stopCurrentAction() {
    const currentGoal = this.goalManager.getCurrentGoal();
    if (currentGoal) {
      logger.info(`Stopping current action: ${currentGoal.action}`);
      const action = registry.get(currentGoal.action);
      if (action && action.metadata.stopHandler) {
        await action.metadata.stopHandler.call(this);
        logger.info(`Stopped action: ${currentGoal.action}`);
      } else {
        logger.warn(`No stop handler found for: ${currentGoal.action}`);
      }
      return true;
    } else {
      logger.debug("No current action to stop");
      return false;
    }
  }

  async executeAction(actionName, args) {
    const action = registry.get(actionName);
    if (!action) {
      logger.error(`Unknown action: ${actionName}`);
      throw new Error(`Unknown action: ${actionName}`);
    }
    logger.debug(`Starting execution of action: ${actionName}`);
    const success = await action.handler.apply(this, args);
    logger.debug(`Completed execution of action: ${actionName}`);
    return success;
  }

  getAll() {
    return registry.getAll();
  }

  getGenericLabels() {
    return genericLabels;
  }
}

module.exports = Actions;