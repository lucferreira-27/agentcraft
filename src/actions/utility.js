const Vec3 = require('vec3');
const { logger } = require('../utils');



function registerUtilityActions(registry, bot, goalManager, agent) {
  registry.register('clearAllGoals', {
    description: 'Clear all pending goals',
    parameters: []
  }, () => {
    goalManager.clearGoals();
    logger.info("Cleared all pending goals");
    return true;
  });

  registry.register('rememberThis', {
    description: 'Write an important piece of information to the journal',
    parameters: [
      { name: 'information', type: 'string', description: 'The information to remember' }
    ]
  }, async (information) => {
    logger.info(`Remembering: ${information}`);
    await agent.journalKeeper.addCustomEntry(information);
    logger.info("Made a note of that information");
    return true;
  });

  registry.register('eatItem', {
    description: 'Eat a specific item',
    parameters: [
      { name: 'itemName', type: 'string', description: 'The name of the item to eat' }
    ]
  }, async (itemName) => {
    const item = bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      logger.warn(`Don't have any ${itemName} in inventory`);
      return false;
    }

    try {
      await bot.equip(item, 'hand');
      await bot.consume();
      logger.info(`Eaten the ${itemName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to eat the ${itemName}: ${error.message}`);
      return false;
    }
  });

  registry.register('equipItem', {
    description: 'Equip a specific item',
    parameters: [
      { name: 'itemName', type: 'string', description: 'The name of the item to equip' },
      { name: 'destination', type: 'string', description: 'The destination to equip the item (default: hand)', default: 'hand' }
    ]
  }, async (itemName, destination = 'hand') => {
    const item = bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      logger.warn(`Don't have any ${itemName} in inventory`);
      return false;
    }

    try {
      await bot.equip(item, destination);
      logger.info(`Equipped the ${itemName} to my ${destination}`);
      return true;
    } catch (error) {
      logger.error(`Failed to equip the ${itemName}: ${error.message}`);
      return false;
    }
  });

  registry.register('dropItem', {
    description: 'Drop a specific item',
    parameters: [
      { name: 'itemName', type: 'string', description: 'The name of the item to drop' },
      { name: 'count', type: 'number', description: 'Number of items to drop', default: 1 }
    ]
  }, async (itemName, count = 1) => {
    const item = bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      logger.warn(`Don't have any ${itemName} in inventory`);
      return false;
    }

    try {
      await bot.toss(item.type, null, count);
      logger.info(`Dropped ${count} ${itemName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to drop the ${itemName}: ${error.message}`);
      return false;
    }
  });

  registry.register('attackEntity', {
    description: 'Attack a specific entity',
    parameters: [
      { name: 'entityName', type: 'string', description: 'The name of the entity to attack' }
    ]
  }, async (entityName) => {
    const entity = Object.values(bot.entities).find(e => e.name === entityName);
    if (!entity) {
      logger.warn(`Can't see any ${entityName} nearby`);
      return false;
    }

    try {
      await bot.attack(entity);
      logger.info(`Attacked the ${entityName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to attack the ${entityName}: ${error.message}`);
      return false;
    }
  });

  registry.register('lookAt', {
    description: 'Look at a specific target',
    parameters: [
      { name: 'target', type: 'string', description: 'The target to look at (can be coordinates or entity name)' }
    ]
  }, async (target) => {
    try {
      if (target.includes(',')) {
        const [x, y, z] = target.split(',').map(Number);
        await bot.lookAt(new Vec3(x, y, z));
        logger.info(`Now looking at the position (${x}, ${y}, ${z})`);
        return true;
      } else {
        const entity = Object.values(bot.entities).find(e => e.name === target);
        if (!entity) {
          logger.warn(`Can't see any ${target} to look at`);
          return false;
        }
        await bot.lookAt(entity.position);
        logger.info(`Now looking at the ${target}`);
        return true;
      }
    } catch (error) {
      logger.error(`Failed to look at the target: ${error.message}`);
      return false;
    }
  });

  registry.register('jump', {
    description: 'Make the bot jump',
    parameters: []
  }, async () => {
    try {
      await bot.setControlState('jump', true);
      await bot.setControlState('jump', false);
      logger.info("Jumped!");
      return true;
    } catch (error) {
      logger.error(`Failed to jump: ${error.message}`);
      return false;
    }
  });

  registry.register('openContainer', {
    description: 'Open a specific container type',
    parameters: [
      { name: 'containerType', type: 'string', description: 'The type of container to open' }
    ]
  }, async (containerType) => {
    const container = bot.findBlock({
      matching: block => block.name === containerType,
      maxDistance: 6
    });

    if (!container) {
      logger.warn(`Can't find any ${containerType} nearby`);
      return false;
    }

    try {
      const chest = await bot.openContainer(container);
      logger.info(`Opened the ${containerType}`);
      await chest.close();
      return true;
    } catch (error) {
      logger.error(`Failed to open the ${containerType}: ${error.message}`);
      return false;
    }
  });

  registry.register('sleep', {
    description: 'Make the bot sleep',
    parameters: []
  }, async () => {
    const bed = bot.findBlock({
      matching: block => bot.isABed(block),
      maxDistance: 6
    });

    if (!bed) {
      logger.warn("Can't find any bed nearby");
      return false;
    }

    try {
      await bot.sleep(bed);
      logger.info("Bot is now sleeping");
      return true;
    } catch (error) {
      logger.error(`Failed to sleep: ${error.message}`);
      return false;
    }
  });

  registry.register('wakeUp', {
    description: 'Wake up from sleeping',
    parameters: []
  }, async () => {
    try {
      await bot.wake();
      logger.info("Bot has woken up");
      return true;
    } catch (error) {
      logger.error(`Failed to wake up: ${error.message}`);
      return false;
    }
  });
}

module.exports = registerUtilityActions;