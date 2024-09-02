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
    logger.debug(`Actions registered [${registry.getAll().length}]: ${registry.getAll().map(action => action.name).join(', ')}`);
  }

  registerActions() {
    this.registerMovableActions();
    this.registerCollectibleActions();
    this.registerUtilityActions();
    // Add more categories as needed
  }

  registerMovableActions() {
    registry.register('moveToBlock', {
      description: 'Move to a specific block type',
      parameters: [
        { name: 'blockType', type: 'string', description: 'The type of block to move to' },
        { name: 'count', type: 'number', description: 'Number of blocks to move to', default: 1 }
      ],
      stopHandler: this.stopMoveToBlock.bind(this) // Register stop handler
    }, this.moveToBlock.bind(this));

    registry.register('followPlayer', {
      description: 'Follow a player',
      parameters: [
        { name: 'playerName', type: 'string', description: 'The name of the player to follow' }
      ],
      stopHandler: this.stopFollowPlayer.bind(this) // Register stop handler
    }, this.followPlayer.bind(this));
  }

  registerCollectibleActions() {
    registry.register('collectBlock', {
      description: 'Collect a specific block type',
      parameters: [
        { name: 'blockType', type: 'string', description: 'The type of block to collect' },
        { name: 'count', type: 'number', description: 'Number of blocks to collect', default: 1 }
      ],
      stopHandler: this.stopCollectBlock.bind(this) // Register stop handler
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

    // Add more utility actions as needed
  }

  async stopCurrentAction() {
    const currentGoal = this.goalManager.getCurrentGoal();
    if (currentGoal) {
      logger.info(`Stopping current action: ${currentGoal.action}`);
      currentGoal.status = 'interrupted';
      
      const action = registry.get(currentGoal.action);
      if (action && action.stopHandler) {
        await action.stopHandler(); // Call the registered stop handler
      } else {
        logger.warn(`No stopping strategy for action: ${currentGoal.action}`);
      }

      this.bot.chat(`I've stopped my current action: ${currentGoal.action}`);
      return true; // Indicate success
    } else {
      this.bot.chat("I'm not currently performing any action.");
      return false; // Indicate failure
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
      this.bot.chat(`I couldn't find any ${blockType} nearby.`);
      return false; // Indicate failure
    }

    const movements = new Movements(this.bot);
    this.bot.pathfinder.setMovements(movements);

    for (const block of blocks) {
      if (this.goalManager.getCurrentGoal()?.status === 'interrupted') {
        this.bot.chat(`I've stopped moving to ${blockType}.`);
        return false; // Indicate failure
      }
      const goal = new goals.GoalGetToBlock(block.x, block.y, block.z);
      await this.bot.pathfinder.goto(goal);
    }

    this.bot.chat(`I've reached the ${blockType}.`);
    return true; // Indicate success
  }

  async collectBlock(blockType, count = 1) {
    logger.info(`Collecting ${count} ${blockType}`);
    const blocks = this.bot.findBlocks({
      matching: blockType,
      maxDistance: 32,
      count: count,
    });

    if (blocks.length === 0) {
      this.bot.chat(`I couldn't find any ${blockType} nearby.`);
      return false; // Indicate failure
    }

    const movements = new Movements(this.bot);
    this.bot.pathfinder.setMovements(movements);

    let collectedCount = 0;
    for (const block of blocks) {
      if (this.goalManager.getCurrentGoal()?.status === 'interrupted') {
        this.bot.chat(`I've stopped collecting ${blockType}. I collected ${collectedCount} so far.`);
        return false; // Indicate failure
      }
      const goal = new goals.GoalBreakBlock(block.x, block.y, block.z);
      await this.bot.pathfinder.goto(goal);
      await this.bot.dig(this.bot.blockAt(block));
      collectedCount++;

      if (collectedCount >= count) break;
    }

    this.bot.chat(`I've collected ${collectedCount} ${blockType}.`);
    return true; // Indicate success
  }

  async craftItem(itemName, count = 1) {
    logger.info(`Crafting ${count} ${itemName}`);
    const recipe = this.bot.recipesFor(itemName)[0];
    if (!recipe) {
      this.bot.chat(`I don't know how to craft ${itemName}.`);
      return false; // Indicate failure
    }

    try {
      await this.bot.craft(recipe, count);
      this.bot.chat(`I've crafted ${count} ${itemName}.`);
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't craft ${itemName}: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async placeBlock(itemName) {
    logger.info(`Placing ${itemName}`);
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      this.bot.chat(`I don't have any ${itemName} in my inventory.`);
      return false; // Indicate failure
    }

    try {
      await this.bot.equip(item, 'hand');
      const referenceBlock = this.bot.blockAtCursor(4);
      if (!referenceBlock) {
        this.bot.chat("I can't see any block to place it against.");
        return false; // Indicate failure
      }
      await this.bot.placeBlock(referenceBlock, this.bot.entity.position.offset(0, -1, 0));
      this.bot.chat(`I've placed the ${itemName}.`);
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't place the ${itemName}: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async followPlayer(playerName) {
    logger.info(`Following player ${playerName}`);
    const player = this.bot.players[playerName] || this.bot.players[this.bot.agent.lastInteractingPlayer];
    if (!player) {
      this.bot.chat(`I can't see ${playerName}. Are you sure that's the correct username?`);
      return false; // Indicate failure
    }

    const goal = new goals.GoalFollow(player.entity, 2);
    this.bot.pathfinder.setGoal(goal, true);
    this.bot.chat(`I'm now following ${player.username}.`);

    while (this.goalManager.getCurrentGoal()?.status !== 'interrupted') {
      if (!this.bot.players[player.username]) {
        this.bot.chat(`I've lost sight of ${player.username}. I'll stop following.`);
        return false; // Indicate failure
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
    }

    this.bot.pathfinder.setGoal(null);
    this.bot.chat(`I've stopped following ${player.username}.`);
    return true; // Indicate success
  }

  async clearAllGoals() {
    this.goalManager.clearGoals();
    this.bot.chat("I've cleared all my pending goals.");
    return true; // Indicate success
  }

  async rememberThis(information) {
    logger.info(`Remembering: ${information}`);
    await this.agent.journalKeeper.addCustomEntry(information);
    this.bot.chat("I've made a note of that information.");
    return true; // Indicate success
  }

  async eatItem(itemName) {
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      this.bot.chat(`I don't have any ${itemName} in my inventory.`);
      return false; // Indicate failure
    }

    try {
      await this.bot.equip(item, 'hand');
      await this.bot.consume();
      this.bot.chat(`I've eaten the ${itemName}.`);
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't eat the ${itemName}: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async equipItem(itemName, destination = 'hand') {
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      this.bot.chat(`I don't have any ${itemName} in my inventory.`);
      return false; // Indicate failure
    }

    try {
      await this.bot.equip(item, destination);
      this.bot.chat(`I've equipped the ${itemName} to my ${destination}.`);
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't equip the ${itemName}: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async dropItem(itemName, count = 1) {
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      this.bot.chat(`I don't have any ${itemName} in my inventory.`);
      return false; // Indicate failure
    }

    try {
      await this.bot.toss(item.type, null, count);
      this.bot.chat(`I've dropped ${count} ${itemName}.`);
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't drop the ${itemName}: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async attackEntity(entityName) {
    const entity = Object.values(this.bot.entities).find(e => e.name === entityName);
    if (!entity) {
      this.bot.chat(`I can't see any ${entityName} nearby.`);
      return false; // Indicate failure
    }

    try {
      await this.bot.attack(entity);
      this.bot.chat(`I've attacked the ${entityName}.`);
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't attack the ${entityName}: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async lookAt(target) {
    try {
      if (target.includes(',')) {
        const [x, y, z] = target.split(',').map(Number);
        await this.bot.lookAt(new Vec3(x, y, z));
        this.bot.chat(`I'm now looking at the position (${x}, ${y}, ${z}).`);
        return true; // Indicate success
      } else {
        const entity = Object.values(this.bot.entities).find(e => e.name === target);
        if (!entity) {
          this.bot.chat(`I can't see any ${target} to look at.`);
          return false; // Indicate failure
        }
        await this.bot.lookAt(entity.position);
        this.bot.chat(`I'm now looking at the ${target}.`);
        return true; // Indicate success
      }
    } catch (error) {
      this.bot.chat(`I couldn't look at the target: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async jump() {
    try {
      await this.bot.setControlState('jump', true);
      await this.bot.setControlState('jump', false);
      this.bot.chat("I've jumped!");
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't jump: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async openContainer(containerType) {
    const container = this.bot.findBlock({
      matching: block => block.name === containerType,
      maxDistance: 6
    });

    if (!container) {
      this.bot.chat(`I can't find any ${containerType} nearby.`);
      return false; // Indicate failure
    }

    try {
      const chest = await this.bot.openContainer(container);
      this.bot.chat(`I've opened the ${containerType}.`);
      // You might want to do something with the opened container here
      await chest.close();
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't open the ${containerType}: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async sleep() {
    const bed = this.bot.findBlock({
      matching: block => this.bot.isABed(block),
      maxDistance: 6
    });

    if (!bed) {
      this.bot.chat("I can't find any bed nearby.");
      return false; // Indicate failure
    }

    try {
      await this.bot.sleep(bed);
      this.bot.chat("I'm now sleeping.");
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't sleep: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async wakeUp() {
    try {
      await this.bot.wake();
      this.bot.chat("I've woken up and I'm ready to go!");
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't wake up: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async fish() {
    try {
      await this.bot.equip(this.bot.inventory.items().find(item => item.name === 'fishing_rod'), 'hand');
      await this.bot.fish();
      this.bot.chat("I've started fishing.");
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't start fishing: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async stopFishing() {
    try {
      this.bot.activateItem();
      this.bot.chat("I've stopped fishing.");
      return true; // Indicate success
    } catch (error) {
      this.bot.chat(`I couldn't stop fishing: ${error.message}`);
      return false; // Indicate failure
    }
  }

  async stopMoveToBlock() {
    this.bot.pathfinder.setGoal(null); // Stop pathfinding
  }

  async stopCollectBlock() {
    this.bot.stopDigging(); // Stop digging
  }

  async stopFollowPlayer() {
    this.bot.pathfinder.setGoal(null); // Stop following
  }

  async executeAction(actionName, args) {
    const action = registry.get(actionName);
    if (!action) {
      throw new Error(`Unknown action: ${actionName}`);
    }
    const success = await action.handler.apply(this, args);
    return success; // Return the success status
  }

  getAll() {
    return registry.getAll();
  }
}

module.exports = Actions;