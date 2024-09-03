const { goals, Movements } = require('mineflayer-pathfinder');
const { logger } = require('../utils');
const { getSpecificBlockTypes } = require('../blockLabels');

function registerCollectionActions(registry, bot, goalManager) {
  registry.register('collectBlock', {
    description: 'Collect a specific block type',
    parameters: [
      { name: 'blockType', type: 'string', description: 'The type of block to collect' },
      { name: 'count', type: 'number', description: 'Number of blocks to collect', default: 1 }
    ],
    stopHandler: () => {
      bot.stopDigging();
      logger.debug("Stopped digging");
    }
  }, async (blockType, count = 1) => {
    logger.info(`Collecting ${count} ${blockType}`);
    const specificBlockTypes = getSpecificBlockTypes(blockType);
    const ids = specificBlockTypes.map(name => bot.registry.blocksByName[name].id);
    logger.debug(`Block IDs: ${ids}`);
    const blocks = bot.findBlocks({
      matching: ids,
      maxDistance: 32,
      count: count,
    });

    if (blocks.length === 0) {
      logger.warn(`No ${blockType} found nearby`);
      return false;
    }

    const movements = new Movements(bot);
    bot.pathfinder.setMovements(movements);

    let collectedCount = 0;
    for (const block of blocks) {
      if (goalManager.getCurrentGoal()?.status === 'interrupted') {
        logger.info(`Collection of ${blockType} interrupted. Collected ${collectedCount} so far.`);
        return false;
      }
      const goal = new goals.GoalBreakBlock(block.x, block.y, block.z);
      await bot.pathfinder.goto(goal);
      await bot.dig(bot.blockAt(block));
      collectedCount++;

      if (collectedCount >= count) break;
    }

    logger.info(`Collected ${collectedCount} ${blockType}`);
    return true;
  });

  // ... other collection actions ...
}

module.exports = registerCollectionActions;