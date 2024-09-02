const { goals, Movements } = require('mineflayer-pathfinder');
const { logger } = require('./utils');
const { registry } = require('./actionRegistry');
const Vec3 = require('vec3');

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
    this.registerMovableActions();
    this.registerCollectibleActions();
    this.registerUtilityActions();
    this.registerFishingActions();
    this.registerBuildingActions();
  }

  registerMovableActions() {
    registry.register('moveToBlock', {
      description: 'Move to a specific block type',
      parameters: [
        { name: 'blockType', type: 'string', description: 'The type of block to move to' },
        { name: 'count', type: 'number', description: 'Number of blocks to move to', default: 1 }
      ],
      stopHandler: this.stopMoveToBlock.bind(this)
    }, this.moveToBlock.bind(this));

    registry.register('followPlayer', {
      description: 'Follow a player',
      parameters: [
        { name: 'playerName', type: 'string', description: 'The name of the player to follow' }
      ],
      stopHandler: this.stopFollowPlayer.bind(this)
    }, this.followPlayer.bind(this));
  }

  registerCollectibleActions() {
    registry.register('collectBlock', {
      description: 'Collect a specific block type',
      parameters: [
        { name: 'blockType', type: 'string', description: 'The type of block to collect' },
        { name: 'count', type: 'number', description: 'Number of blocks to collect', default: 1 }
      ],
      stopHandler: this.stopCollectBlock.bind(this)
    }, this.collectBlock.bind(this));
  }

  registerUtilityActions() {
    registry.register('clearAllGoals', {
      description: 'Clear all pending goals',
      parameters: []
    }, this.clearAllGoals.bind(this));

    registry.register('rememberThis', {
      description: 'Write an important piece of information to the journal',
      parameters: [
        { name: 'information', type: 'string', description: 'The information to remember' }
      ]
    }, this.rememberThis.bind(this));

    registry.register('wakeUp', {
      description: 'Wake up from sleeping',
      parameters: []
    }, this.wakeUp.bind(this));

    registry.register('eatItem', {
      description: 'Eat a specific item',
      parameters: [
        { name: 'itemName', type: 'string', description: 'The name of the item to eat' }
      ]
    }, this.eatItem.bind(this));

    registry.register('equipItem', {
      description: 'Equip a specific item',
      parameters: [
        { name: 'itemName', type: 'string', description: 'The name of the item to equip' },
        { name: 'destination', type: 'string', description: 'The destination to equip the item (default: hand)', default: 'hand' }
      ]
    }, this.equipItem.bind(this));

    registry.register('dropItem', {
      description: 'Drop a specific item',
      parameters: [
        { name: 'itemName', type: 'string', description: 'The name of the item to drop' },
        { name: 'count', type: 'number', description: 'Number of items to drop', default: 1 }
      ]
    }, this.dropItem.bind(this));

    registry.register('attackEntity', {
      description: 'Attack a specific entity',
      parameters: [
        { name: 'entityName', type: 'string', description: 'The name of the entity to attack' }
      ]
    }, this.attackEntity.bind(this));

    registry.register('lookAt', {
      description: 'Look at a specific target',
      parameters: [
        { name: 'target', type: 'string', description: 'The target to look at (can be coordinates or entity name)' }
      ]
    }, this.lookAt.bind(this));

    registry.register('jump', {
      description: 'Make the bot jump',
      parameters: []
    }, this.jump.bind(this));

    registry.register('openContainer', {
      description: 'Open a specific container type',
      parameters: [
        { name: 'containerType', type: 'string', description: 'The type of container to open' }
      ]
    }, this.openContainer.bind(this));

    registry.register('sleep', {
      description: 'Make the bot sleep',
      parameters: []
    }, this.sleep.bind(this));
  }

  registerFishingActions() {
    registry.register('fish', {
      description: 'Start fishing',
      parameters: []
    }, this.fish.bind(this));

    registry.register('stopFishing', {
      description: 'Stop fishing',
      parameters: []
    }, this.stopFishing.bind(this));
  }

  registerBuildingActions() {
    
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

  async moveToBlock(blockType, count = 1) {
    logger.info(`Moving to ${count} ${blockType}`);
    const blocks = this.bot.findBlocks({
      matching: blockType,
      maxDistance: 32,
      count: count,
    });

    if (blocks.length === 0) {
      logger.warn(`No ${blockType} found nearby`);
      return false;
    }

    const movements = new Movements(this.bot);
    this.bot.pathfinder.setMovements(movements);

    for (const block of blocks) {
      if (this.goalManager.getCurrentGoal()?.status === 'interrupted') {
        logger.info(`Movement to ${blockType} interrupted`);
        return false;
      }
      const goal = new goals.GoalGetToBlock(block.x, block.y, block.z);
      await this.bot.pathfinder.goto(goal);
    }

    logger.info(`Reached ${blockType}`);
    return true;
  }

  async collectBlock(blockType, count = 1) {
    logger.info(`Collecting ${count} ${blockType}`);
    const blocks = this.bot.findBlocks({
      matching: blockType,
      maxDistance: 32,
      count: count,
    });

    if (blocks.length === 0) {
      logger.warn(`No ${blockType} found nearby`);
      return false;
    }

    const movements = new Movements(this.bot);
    this.bot.pathfinder.setMovements(movements);

    let collectedCount = 0;
    for (const block of blocks) {
      if (this.goalManager.getCurrentGoal()?.status === 'interrupted') {
        logger.info(`Collection of ${blockType} interrupted. Collected ${collectedCount} so far.`);
        return false;
      }
      const goal = new goals.GoalBreakBlock(block.x, block.y, block.z);
      await this.bot.pathfinder.goto(goal);
      await this.bot.dig(this.bot.blockAt(block));
      collectedCount++;

      if (collectedCount >= count) break;
    }

    logger.info(`Collected ${collectedCount} ${blockType}`);
    return true;
  }

  async craftItem(itemName, count = 1) {
    logger.info(`Crafting ${count} ${itemName}`);
    const recipe = this.bot.recipesFor(itemName)[0];
    if (!recipe) {
      logger.warn(`Don't know how to craft ${itemName}`);
      return false;
    }

    try {
      await this.bot.craft(recipe, count);
      logger.info(`Crafted ${count} ${itemName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to craft ${itemName}: ${error.message}`);
      return false;
    }
  }

  async placeBlock(itemName) {
    logger.info(`Placing ${itemName}`);
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      logger.warn(`Don't have any ${itemName} in inventory`);
      return false;
    }

    try {
      await this.bot.equip(item, 'hand');
      const referenceBlock = this.bot.blockAtCursor(4);
      if (!referenceBlock) {
        logger.warn("Can't see any block to place it against");
        return false;
      }
      await this.bot.placeBlock(referenceBlock, this.bot.entity.position.offset(0, -1, 0));
      logger.info(`Placed the ${itemName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to place the ${itemName}: ${error.message}`);
      return false;
    }
  }

  async followPlayer(playerName) {
    logger.info(`Following player ${playerName}`);
    const player = this.bot.players[playerName] || this.bot.players[this.bot.agent.lastInteractingPlayer];
    if (!player) {
      logger.warn(`Can't see ${playerName}. Are you sure that's the correct username?`);
      return false;
    }

    const goal = new goals.GoalFollow(player.entity, 2);
    this.bot.pathfinder.setGoal(goal, true);
    logger.info(`Now following ${player.username}`);

    while (this.goalManager.getCurrentGoal()?.status !== 'interrupted') {
      if (!this.bot.players[player.username]) {
        logger.info(`Lost sight of ${player.username}. Stopping follow.`);
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.bot.pathfinder.setGoal(null);
    logger.info(`Stopped following ${player.username}`);
    return true;
  }

  async clearAllGoals() {
    this.goalManager.clearGoals();
    logger.info("Cleared all pending goals");
    return true;
  }

  async rememberThis(information) {
    logger.info(`Remembering: ${information}`);
    await this.agent.journalKeeper.addCustomEntry(information);
    logger.info("Made a note of that information");
    return true;
  }

  async eatItem(itemName) {
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      logger.warn(`Don't have any ${itemName} in inventory`);
      return false;
    }

    try {
      await this.bot.equip(item, 'hand');
      await this.bot.consume();
      logger.info(`Eaten the ${itemName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to eat the ${itemName}: ${error.message}`);
      return false;
    }
  }

  async equipItem(itemName, destination = 'hand') {
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      logger.warn(`Don't have any ${itemName} in inventory`);
      return false;
    }

    try {
      await this.bot.equip(item, destination);
      logger.info(`Equipped the ${itemName} to my ${destination}`);
      return true;
    } catch (error) {
      logger.error(`Failed to equip the ${itemName}: ${error.message}`);
      return false;
    }
  }

  async dropItem(itemName, count = 1) {
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      logger.warn(`Don't have any ${itemName} in inventory`);
      return false;
    }

    try {
      await this.bot.toss(item.type, null, count);
      logger.info(`Dropped ${count} ${itemName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to drop the ${itemName}: ${error.message}`);
      return false;
    }
  }

  async attackEntity(entityName) {
    const entity = Object.values(this.bot.entities).find(e => e.name === entityName);
    if (!entity) {
      logger.warn(`Can't see any ${entityName} nearby`);
      return false;
    }

    try {
      await this.bot.attack(entity);
      logger.info(`Attacked the ${entityName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to attack the ${entityName}: ${error.message}`);
      return false;
    }
  }

  async lookAt(target) {
    try {
      if (target.includes(',')) {
        const [x, y, z] = target.split(',').map(Number);
        await this.bot.lookAt(new Vec3(x, y, z));
        logger.info(`Now looking at the position (${x}, ${y}, ${z})`);
        return true;
      } else {
        const entity = Object.values(this.bot.entities).find(e => e.name === target);
        if (!entity) {
          logger.warn(`Can't see any ${target} to look at`);
          return false;
        }
        await this.bot.lookAt(entity.position);
        logger.info(`Now looking at the ${target}`);
        return true;
      }
    } catch (error) {
      logger.error(`Failed to look at the target: ${error.message}`);
      return false;
    }
  }

  async jump() {
    try {
      await this.bot.setControlState('jump', true);
      await this.bot.setControlState('jump', false);
      logger.info("Jumped!");
      return true;
    } catch (error) {
      logger.error(`Failed to jump: ${error.message}`);
      return false;
    }
  }

  async openContainer(containerType) {
    const container = this.bot.findBlock({
      matching: block => block.name === containerType,
      maxDistance: 6
    });

    if (!container) {
      logger.warn(`Can't find any ${containerType} nearby`);
      return false;
    }

    try {
      const chest = await this.bot.openContainer(container);
      logger.info(`Opened the ${containerType}`);
      await chest.close();
      return true;
    } catch (error) {
      logger.error(`Failed to open the ${containerType}: ${error.message}`);
      return false;
    }
  }

  async sleep() {
    const bed = this.bot.findBlock({
      matching: block => this.bot.isABed(block),
      maxDistance: 6
    });

    if (!bed) {
      logger.warn("Can't find any bed nearby");
      return false;
    }

    try {
      await this.bot.sleep(bed);
      logger.info("Bot is now sleeping");
      return true;
    } catch (error) {
      logger.error(`Failed to sleep: ${error.message}`);
      return false;
    }
  }

  async wakeUp() {
    try {
      await this.bot.wake();
      logger.info("Bot has woken up");
      return true;
    } catch (error) {
      logger.error(`Failed to wake up: ${error.message}`);
      return false;
    }
  }

  async fish() {
    try {
      await this.bot.equip(this.bot.inventory.items().find(item => item.name === 'fishing_rod'), 'hand');
      await this.bot.fish();
      logger.info("Started fishing");
      return true;
    } catch (error) {
      logger.error(`Failed to start fishing: ${error.message}`);
      return false;
    }
  }

  async stopFishing() {
    try {
      this.bot.activateItem();
      logger.info("Stopped fishing");
      return true;
    } catch (error) {
      logger.error(`Failed to stop fishing: ${error.message}`);
      return false;
    }
  }

  async stopMoveToBlock() {
    this.bot.pathfinder.setGoal(null);
    logger.debug("Stopped pathfinding");
  }

  async stopCollectBlock() {
    this.bot.stopDigging();
    logger.debug("Stopped digging");
  }

  async stopFollowPlayer() {
    this.bot.pathfinder.setGoal(null);
    logger.debug("Stopped following");
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
}

module.exports = Actions;