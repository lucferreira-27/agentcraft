const { goals, Movements } = require('mineflayer-pathfinder');
const { logger } = require('../utils');
const { getSpecificBlockTypes } = require('../blockLabels');

function registerMovementActions(registry, bot, goalManager) {
  registry.register('moveToBlock', {
    description: 'Move to a specific block type',
    parameters: [
      { name: 'blockType', type: 'string', description: 'The type of block to move to' },
      { name: 'count', type: 'number', description: 'Number of blocks to move to', default: 1 }
    ],
    stopHandler: () => {
      bot.pathfinder.setGoal(null);
      logger.debug("Stopped pathfinding");
    }
  }, async (blockType, count = 1) => {
    logger.info(`Moving to ${count} ${blockType}`);
    const specificBlockTypes = getSpecificBlockTypes(blockType);
    logger.debug(`Specific block types: ${specificBlockTypes}`);
    const ids = specificBlockTypes.map(name => bot.registry.blocksByName[name].id);
    logger.debug(`Block IDs: ${ids}`);
    const blocks = bot.findBlocks({
      matching: ids,
      maxDistance: 128,
      count: count,
    });

    if (blocks.length === 0) {
      logger.warn(`No ${blockType} found nearby`);
      return false;
    }

    const movements = new Movements(bot);
    bot.pathfinder.setMovements(movements);

    for (const block of blocks) {
      if (goalManager.getCurrentGoal()?.status === 'interrupted') {
        logger.info(`Movement to ${blockType} interrupted`);
        return false;
      }
      const goal = new goals.GoalGetToBlock(block.x, block.y, block.z);
      await bot.pathfinder.goto(goal);
    }

    logger.info(`Reached ${blockType}`);
    return true;
  });

  registry.register('followPlayer', {
    description: 'Follow a player',
    parameters: [
      { name: 'playerName', type: 'string', description: 'The name of the player to follow' }
    ],
    stopHandler: () => {
      bot.pathfinder.setGoal(null);
      logger.debug("Stopped following");
    }
  }, async (playerName) => {
    logger.info(`Following player ${playerName}`);
    const player = bot.players[playerName];
    if (!player) {
      logger.warn(`Can't see ${playerName}. Are you sure that's the correct username?`);
      return false;
    }

    const goal = new goals.GoalFollow(player.entity, 2);
    bot.pathfinder.setGoal(goal, true);
    logger.info(`Now following ${player.username}`);

    while (goalManager.getCurrentGoal()?.status !== 'interrupted') {
      if (!bot.players[player.username]) {
        logger.info(`Lost sight of ${player.username}. Stopping follow.`);
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    bot.pathfinder.setGoal(null);
    logger.info(`Stopped following ${player.username}`);
    return true;
  });
}

module.exports = registerMovementActions;