const { logger } = require('../utils');

function registerCraftingActions(registry, bot) {
  registry.register('craftItem', {
    description: 'Craft a specific item',
    parameters: [
      { name: 'itemName', type: 'string', description: 'The name of the item to craft' },
      { name: 'count', type: 'number', description: 'Number of items to craft', default: 1 }
    ]
  }, async (itemName, count = 1) => {
    logger.info(`Crafting ${count} ${itemName}`);
    const recipe = bot.recipesFor(itemName)[0];
    if (!recipe) {
      logger.warn(`Don't know how to craft ${itemName}`);
      return false;
    }

    try {
      await bot.craft(recipe, count);
      logger.info(`Crafted ${count} ${itemName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to craft ${itemName}: ${error.message}`);
      return false;
    }
  });
}

module.exports = registerCraftingActions;