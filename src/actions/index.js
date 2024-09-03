const registerMovementActions = require('./movement');
const registerCollectionActions = require('./collection');
const registerCraftingActions = require('./crafting');
const registerUtilityActions = require('./utility');
const registerFishingActions = require('./fishing');
const registerBuildingActions = require('./building');

function registerAllActions(registry, bot, goalManager, agent) {
  registerMovementActions(registry, bot, goalManager);
  registerCollectionActions(registry, bot, goalManager);
  registerCraftingActions(registry, bot);
  registerUtilityActions(registry, bot, goalManager, agent);
  registerFishingActions(registry, bot);
  registerBuildingActions(registry, bot);
}

module.exports = registerAllActions;