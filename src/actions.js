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
  }

  registerActions() {
    registry.register('moveToBlock', {
      description: 'Move to a specific block type',
      parameters: [
        { name: 'blockType', type: 'string', description: 'The type of block to move to' },
        { name: 'count', type: 'number', description: 'Number of blocks to move to', default: 1 }
      ]
    }, this.moveToBlock.bind(this));

    registry.register('collectBlock', {
      description: 'Collect a specific block type',
      parameters: [
        { name: 'blockType', type: 'string', description: 'The type of block to collect' },
        { name: 'count', type: 'number', description: 'Number of blocks to collect', default: 1 }
      ]
    }, this.collectBlock.bind(this));

    registry.register('craftItem', {
      description: 'Craft an item',
      parameters: [
        { name: 'itemName', type: 'string', description: 'The name of the item to craft' },
        { name: 'count', type: 'number', description: 'Number of items to craft', default: 1 }
      ]
    }, this.craftItem.bind(this));

    registry.register('placeBlock', {
      description: 'Place a block',
      parameters: [
        { name: 'itemName', type: 'string', description: 'The name of the block to place' }
      ]
    }, this.placeBlock.bind(this));

    registry.register('followPlayer', {
      description: 'Follow a player',
      parameters: [
        { name: 'playerName', type: 'string', description: 'The name of the player to follow' }
      ]
    }, this.followPlayer.bind(this));

    registry.register('stopCurrentAction', {
      description: 'Stop the current action',
      parameters: []
    }, this.stopCurrentAction.bind(this));

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

    registry.register('eatItem', {
      description: 'Eat a food item from the inventory',
      parameters: [
        { name: 'itemName', type: 'string', description: 'The name of the food item to eat' }
      ]
    }, this.eatItem.bind(this));

    registry.register('equipItem', {
      description: 'Equip an item from the inventory',
      parameters: [
        { name: 'itemName', type: 'string', description: 'The name of the item to equip' },
        { name: 'destination', type: 'string', description: 'Where to equip the item (hand, head, torso, legs, feet)', default: 'hand' }
      ]
    }, this.equipItem.bind(this));

    registry.register('dropItem', {
      description: 'Drop an item from the inventory',
      parameters: [
        { name: 'itemName', type: 'string', description: 'The name of the item to drop' },
        { name: 'count', type: 'number', description: 'The number of items to drop', default: 1 }
      ]
    }, this.dropItem.bind(this));

    registry.register('attackEntity', {
      description: 'Attack a nearby entity',
      parameters: [
        { name: 'entityName', type: 'string', description: 'The name of the entity to attack' }
      ]
    }, this.attackEntity.bind(this));

    registry.register('lookAt', {
      description: 'Look at a specific position or entity',
      parameters: [
        { name: 'target', type: 'string', description: 'The position (x,y,z) or entity name to look at' }
      ]
    }, this.lookAt.bind(this));

    registry.register('jump', {
      description: 'Make the bot jump',
      parameters: []
    }, this.jump.bind(this));

    registry.register('openContainer', {
      description: 'Open a nearby container',
      parameters: [
        { name: 'containerType', type: 'string', description: 'The type of container to open (e.g., chest, furnace)' }
      ]
    }, this.openContainer.bind(this));

    registry.register('sleep', {
      description: 'Sleep in a nearby bed',
      parameters: []
    }, this.sleep.bind(this));

    registry.register('wakeUp', {
      description: 'Wake up from sleeping',
      parameters: []
    }, this.wakeUp.bind(this));

    registry.register('fish', {
      description: 'Start fishing',
      parameters: []
    }, this.fish.bind(this));

    registry.register('stopFishing', {
      description: 'Stop fishing',
      parameters: []
    }, this.stopFishing.bind(this));
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
      return;
    }

    const movements = new Movements(this.bot);
    this.bot.pathfinder.setMovements(movements);

    for (const block of blocks) {
      if (this.goalManager.getCurrentGoal()?.status === 'interrupted') {
        this.bot.chat(`I've stopped moving to ${blockType}.`);
        return;
      }
      const goal = new goals.GoalGetToBlock(block.x, block.y, block.z);
      await this.bot.pathfinder.goto(goal);
    }

    this.bot.chat(`I've reached the ${blockType}.`);
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
      return;
    }

    const movements = new Movements(this.bot);
    this.bot.pathfinder.setMovements(movements);

    let collectedCount = 0;
    for (const block of blocks) {
      if (this.goalManager.getCurrentGoal()?.status === 'interrupted') {
        this.bot.chat(`I've stopped collecting ${blockType}. I collected ${collectedCount} so far.`);
        return;
      }
      const goal = new goals.GoalBreakBlock(block.x, block.y, block.z);
      await this.bot.pathfinder.goto(goal);
      await this.bot.dig(this.bot.blockAt(block));
      collectedCount++;

      if (collectedCount >= count) break;
    }

    this.bot.chat(`I've collected ${collectedCount} ${blockType}.`);
  }

  async craftItem(itemName, count = 1) {
    logger.info(`Crafting ${count} ${itemName}`);
    const recipe = this.bot.recipesFor(itemName)[0];
    if (!recipe) {
      this.bot.chat(`I don't know how to craft ${itemName}.`);
      return;
    }

    try {
      await this.bot.craft(recipe, count);
      this.bot.chat(`I've crafted ${count} ${itemName}.`);
    } catch (error) {
      this.bot.chat(`I couldn't craft ${itemName}: ${error.message}`);
    }
  }

  async placeBlock(itemName) {
    logger.info(`Placing ${itemName}`);
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      this.bot.chat(`I don't have any ${itemName} in my inventory.`);
      return;
    }

    try {
      await this.bot.equip(item, 'hand');
      const referenceBlock = this.bot.blockAtCursor(4);
      if (!referenceBlock) {
        this.bot.chat("I can't see any block to place it against.");
        return;
      }
      await this.bot.placeBlock(referenceBlock, this.bot.entity.position.offset(0, -1, 0));
      this.bot.chat(`I've placed the ${itemName}.`);
    } catch (error) {
      this.bot.chat(`I couldn't place the ${itemName}: ${error.message}`);
    }
  }

  async followPlayer(playerName) {
    logger.info(`Following player ${playerName}`);
    const player = this.bot.players[playerName] || this.bot.players[this.bot.agent.lastInteractingPlayer];
    if (!player) {
      this.bot.chat(`I can't see ${playerName}. Are you sure that's the correct username?`);
      return;
    }

    const goal = new goals.GoalFollow(player.entity, 2);
    this.bot.pathfinder.setGoal(goal, true);
    this.bot.chat(`I'm now following ${player.username}.`);

    while (this.goalManager.getCurrentGoal()?.status !== 'interrupted') {
      if (!this.bot.players[player.username]) {
        this.bot.chat(`I've lost sight of ${player.username}. I'll stop following.`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
    }

    this.bot.pathfinder.setGoal(null);
    this.bot.chat(`I've stopped following ${player.username}.`);
  }

  async stopCurrentAction() {
    const currentGoal = this.goalManager.getCurrentGoal();
    if (currentGoal) {
      currentGoal.status = 'interrupted';
      this.bot.pathfinder.setGoal(null);
      this.bot.stopDigging();
      // Add any other necessary cleanup actions here
      this.bot.chat(`I've stopped my current action: ${currentGoal.action}`);
    } else {
      this.bot.chat("I'm not currently performing any action.");
    }
  }

  async clearAllGoals() {
    this.goalManager.clearGoals();
    this.bot.chat("I've cleared all my pending goals.");
  }

  async rememberThis(information) {
    logger.info(`Remembering: ${information}`);
    await this.agent.journalKeeper.addCustomEntry(information);
    this.bot.chat("I've made a note of that information.");
  }

  async eatItem(itemName) {
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      this.bot.chat(`I don't have any ${itemName} in my inventory.`);
      return;
    }

    try {
      await this.bot.equip(item, 'hand');
      await this.bot.consume();
      this.bot.chat(`I've eaten the ${itemName}.`);
    } catch (error) {
      this.bot.chat(`I couldn't eat the ${itemName}: ${error.message}`);
    }
  }

  async equipItem(itemName, destination = 'hand') {
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      this.bot.chat(`I don't have any ${itemName} in my inventory.`);
      return;
    }

    try {
      await this.bot.equip(item, destination);
      this.bot.chat(`I've equipped the ${itemName} to my ${destination}.`);
    } catch (error) {
      this.bot.chat(`I couldn't equip the ${itemName}: ${error.message}`);
    }
  }

  async dropItem(itemName, count = 1) {
    const item = this.bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
      this.bot.chat(`I don't have any ${itemName} in my inventory.`);
      return;
    }

    try {
      await this.bot.toss(item.type, null, count);
      this.bot.chat(`I've dropped ${count} ${itemName}.`);
    } catch (error) {
      this.bot.chat(`I couldn't drop the ${itemName}: ${error.message}`);
    }
  }

  async attackEntity(entityName) {
    const entity = Object.values(this.bot.entities).find(e => e.name === entityName);
    if (!entity) {
      this.bot.chat(`I can't see any ${entityName} nearby.`);
      return;
    }

    try {
      await this.bot.attack(entity);
      this.bot.chat(`I've attacked the ${entityName}.`);
    } catch (error) {
      this.bot.chat(`I couldn't attack the ${entityName}: ${error.message}`);
    }
  }

  async lookAt(target) {
    try {
      if (target.includes(',')) {
        const [x, y, z] = target.split(',').map(Number);
        await this.bot.lookAt(new Vec3(x, y, z));
        this.bot.chat(`I'm now looking at the position (${x}, ${y}, ${z}).`);
      } else {
        const entity = Object.values(this.bot.entities).find(e => e.name === target);
        if (!entity) {
          this.bot.chat(`I can't see any ${target} to look at.`);
          return;
        }
        await this.bot.lookAt(entity.position);
        this.bot.chat(`I'm now looking at the ${target}.`);
      }
    } catch (error) {
      this.bot.chat(`I couldn't look at the target: ${error.message}`);
    }
  }

  async jump() {
    try {
      await this.bot.setControlState('jump', true);
      await this.bot.setControlState('jump', false);
      this.bot.chat("I've jumped!");
    } catch (error) {
      this.bot.chat(`I couldn't jump: ${error.message}`);
    }
  }

  async openContainer(containerType) {
    const container = this.bot.findBlock({
      matching: block => block.name === containerType,
      maxDistance: 6
    });

    if (!container) {
      this.bot.chat(`I can't find any ${containerType} nearby.`);
      return;
    }

    try {
      const chest = await this.bot.openContainer(container);
      this.bot.chat(`I've opened the ${containerType}.`);
      // You might want to do something with the opened container here
      await chest.close();
    } catch (error) {
      this.bot.chat(`I couldn't open the ${containerType}: ${error.message}`);
    }
  }

  async sleep() {
    const bed = this.bot.findBlock({
      matching: block => this.bot.isABed(block),
      maxDistance: 6
    });

    if (!bed) {
      this.bot.chat("I can't find any bed nearby.");
      return;
    }

    try {
      await this.bot.sleep(bed);
      this.bot.chat("I'm now sleeping.");
    } catch (error) {
      this.bot.chat(`I couldn't sleep: ${error.message}`);
    }
  }

  async wakeUp() {
    try {
      await this.bot.wake();
      this.bot.chat("I've woken up and I'm ready to go!");
    } catch (error) {
      this.bot.chat(`I couldn't wake up: ${error.message}`);
    }
  }

  async fish() {
    try {
      await this.bot.equip(this.bot.inventory.items().find(item => item.name === 'fishing_rod'), 'hand');
      await this.bot.fish();
      this.bot.chat("I've started fishing.");
    } catch (error) {
      this.bot.chat(`I couldn't start fishing: ${error.message}`);
    }
  }

  async stopFishing() {
    try {
      this.bot.activateItem();
      this.bot.chat("I've stopped fishing.");
    } catch (error) {
      this.bot.chat(`I couldn't stop fishing: ${error.message}`);
    }
  }

  async executeAction(actionName, args) {
    const action = registry.get(actionName);
    if (!action) {
      throw new Error(`Unknown action: ${actionName}`);
    }
    return action.handler.apply(this, args);
  }
}

module.exports = Actions;