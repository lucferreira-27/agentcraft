const { goals, Movements } = require('mineflayer-pathfinder');
const { logger } = require('../utils');
const { getSpecificBlockTypes } = require('../blockLabels');
const Vec3 = require('vec3');

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
    logger.debug(`Searching for ${blockType}... aka ${specificBlockTypes.join(', ')}
    with ids ${ids.join(', ')}`);
    const blocks = bot.findBlocks({
      matching: ids,
      maxDistance: 32,
      count: count,
    });

    if (blocks.length === 0) {
      logger.warn(`No ${blockType} found nearby`);
      return false;
    }
    logger.debug(`Found ${blocks.length} ${blockType} `);

    const movements = new Movements(bot);
    bot.pathfinder.setMovements(movements);

    let collectedCount = 0;
    let retries = 3;
    while (retries > 0) {
      try {
        for (const block of blocks) {
          if (goalManager.getCurrentGoal()?.status === 'interrupted') {
            logger.info(`Collection of ${blockType} interrupted. Collected ${collectedCount} so far.`);
            return false;
          }
          logger.debug(`Collecting block at ${block.x}, ${block.y}, ${block.z}`);
          const currentBlock = bot.blockAt(new Vec3(block.x, block.y, block.z));
          if (!currentBlock || !ids.includes(currentBlock.type)) {
            logger.debug(`Block at ${block.x}, ${block.y}, ${block.z} is no longer ${blockType}. Skipping.`);
            continue;
          }
          const goal = new goals.GoalBreakBlock(block.x, block.y, block.z);
          await bot.pathfinder.goto(goal);
          await bot.dig(currentBlock);
          collectedCount++;

          if (collectedCount >= count) break;
        }
        break;
      } catch (error) {
        logger.warn(`Error during collection, retrying. ${retries} attempts left.`);
        retries--;
        if (retries === 0) throw error;
      }
    }

    logger.info(`Collected ${collectedCount} ${blockType}`);
    return true;
  });

  // ... other collection actions ...
}

module.exports = registerCollectionActions;