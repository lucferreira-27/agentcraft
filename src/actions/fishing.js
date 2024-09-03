const { logger } = require('../utils');

function registerFishingActions(registry, bot) {
  registry.register('fish', {
    description: 'Start fishing',
    parameters: []
  }, async () => {
    try {
      await bot.equip(bot.inventory.items().find(item => item.name === 'fishing_rod'), 'hand');
      await bot.fish();
      logger.info("Started fishing");
      return true;
    } catch (error) {
      logger.error(`Failed to start fishing: ${error.message}`);
      return false;
    }
  });

  registry.register('stopFishing', {
    description: 'Stop fishing',
    parameters: []
  }, () => {
    try {
      bot.activateItem();
      logger.info("Stopped fishing");
      return true;
    } catch (error) {
      logger.error(`Failed to stop fishing: ${error.message}`);
      return false;
    }
  });
}

module.exports = registerFishingActions;