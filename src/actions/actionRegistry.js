const { goals: { GoalNear, GoalBlock, GoalXZ, GoalY } } = require('mineflayer-pathfinder');
const logger = require('../logger');
const Vec3 = require('vec3');
const botManager = require('../botManager');

// Mapping of general terms to specific Minecraft block types
const blockTypeMapping = {
  wood: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
  dirt: ['dirt', 'grass_block', 'podzol'],
  stone: ['stone', 'cobblestone', 'granite', 'diorite', 'andesite'],
  sand: ['sand', 'red_sand'],
  gravel: ['gravel'],
  // Add more mappings as needed
};

const equipmentSlots = {
  'mainhand': 'hand',
  'offhand': 'off-hand',
  'head': 'head',
  'chest': 'torso',
  'legs': 'legs',
  'feet': 'feet'
};

function validateEquipmentSlot(slot) {
  const validSlot = equipmentSlots[slot.toLowerCase()] || slot;
  if (!Object.values(equipmentSlots).includes(validSlot)) {
    throw new Error(`Invalid equipment slot: ${slot}`);
  }
  return validSlot;
}

class Action {
  constructor(execute) {
    this.execute = (parameters, bot, goalManager, shouldStop) => 
      execute(parameters, bot, goalManager, shouldStop);
  }
}

class ActionRegistry {
  constructor() {
    this.actions = new Map();
  }

  registerAction(name, executeFn) {
    this.actions.set(name, new Action(executeFn));
  }

  getAction(name) {
    return this.actions.get(name);
  }
}

const actionRegistry = new ActionRegistry();

// Register actions
actionRegistry.registerAction('followPlayer', async function({ username, stopAtPlayerPosition, duration }, bot, goalManager, shouldStop) {
  const targetPlayer = bot.players[username]?.entity;
  if (!targetPlayer) throw new Error(`Player ${username} not found.`);

  const isDurationZero = duration === 0 || duration === undefined || duration === null;
  const effectiveDuration = isDurationZero || stopAtPlayerPosition ? 2147483647 : duration;

  logger.debug('ACTION', 'followPlayer', `Starting to follow player: ${username}`, { duration: effectiveDuration, stopAtPlayerPosition });

  return new Promise((resolve) => {
    const startTime = Date.now();
    let closePositionCount = 0;
    let isPaused = false;

    const followInterval = setInterval(() => {
      if (shouldStop() || isPaused) {
        clearInterval(followInterval);
        logger.debug('ACTION', 'followPlayer', `Stopped following player: ${username}`);
        resolve({ stopped: true });
        return;
      }

      const currentTime = Date.now();
      if (currentTime - startTime >= effectiveDuration) {
        clearInterval(followInterval);
        logger.debug('ACTION', 'followPlayer', `Follow duration expired for player: ${username}`);
        resolve({ stopped: false, reason: 'duration_expired' });
        return;
      }

      const distance = bot.entity.position.distanceTo(targetPlayer.position);
      if (distance > 3) {
        closePositionCount = 0;
        const goal = new GoalNear(targetPlayer.position.x, targetPlayer.position.y, targetPlayer.position.z, 2);
        bot.pathfinder.setGoal(goal);
      } else if (stopAtPlayerPosition) {
        closePositionCount++;
        if (closePositionCount >= 5) {
          const finalDistance = bot.entity.position.distanceTo(targetPlayer.position);
          if (finalDistance <= 3) {
            clearInterval(followInterval);
            logger.debug('ACTION', 'followPlayer', `Reached player ${username}'s position`, { distance: finalDistance.toFixed(2) });
            resolve({ stopped: false, reason: 'reached_position', distance: finalDistance });
            return;
          } else {
            closePositionCount = 0;
          }
        }
      } else {
        closePositionCount = 0;
      }
    }, 100);

    const pauseFollowing = () => {
      if (isPaused) {resumeFollowing(); return}
      
      logger.debug('ACTION', 'ActionRegistry', `Pausing following player: ${username}`);
      isPaused = true;
      bot.pathfinder.setGoal(null);
    };

    const resumeFollowing = () => {
      logger.debug('ACTION', 'ActionRegistry', `Resuming following player: ${username}`);
      isPaused = false;
    };

    // Register pause and resume methods
    goalManager.registerActionPauseMethod('followPlayer', pauseFollowing);

    if (!stopAtPlayerPosition) {
      setTimeout(() => {
        clearInterval(followInterval);
        logger.debug('ACTION', 'followPlayer', `Finished following player: ${username}`);
        resolve({ stopped: false, reason: 'duration_expired' });
      }, effectiveDuration);
    }
  });
});

actionRegistry.registerAction('collectBlock', async function({ blockType, quantity }, bot, goalManager, shouldStop) {
  const blocksToCollect = blockTypeMapping[blockType] || [blockType];
  let collectedCount = 0;
  let maxSearchDistance = 32;

  logger.debug('ACTION', 'collectBlock', `Starting to collect ${quantity} ${blockType}`, { blocksToCollect });

  // Create initial inventory snapshot
  const initialInventory = bot.inventory.items().filter(item => blocksToCollect.includes(item.name));
  const initialCount = initialInventory.reduce((sum, item) => sum + item.count, 0);

  function getCollectedCount() {
    const currentInventory = bot.inventory.items().filter(item => blocksToCollect.includes(item.name));
    const currentCount = currentInventory.reduce((sum, item) => sum + item.count, 0);
    return currentCount - initialCount;
  }

  async function collectDroppedItems() {
    logger.debug('ACTION', 'collectBlock', `Collecting dropped items`);
    const droppedItems = Object.values(bot.entities).filter(entity => 
      entity.name === 'item' && 
      blocksToCollect.includes(entity.entityType)
    );

    for (const item of droppedItems) {
      if (shouldStop()) return;

      if (bot.entity.position.distanceTo(item.position) > 2) {
        await bot.pathfinder.goto(new GoalNear(item.position.x, item.position.y, item.position.z, 1));
      }

      try {
        await bot.collectBlock.collect(item);
        collectedCount++;
        logger.debug('ACTION', 'collectBlock', `Collected dropped ${item.entityType}`, { count: collectedCount, target: quantity });
      } catch (error) {
        logger.warn('ACTION', 'collectBlock', `Failed to collect dropped ${item.entityType}`, { error: error.message });
      }

      if (collectedCount >= quantity) return;
    }
  }

  while (collectedCount < quantity) {
    if (shouldStop()) {
      logger.debug('ACTION', 'collectBlock', `Stopping block collection as requested.`);
      return { collected: collectedCount, stopped: true };
    }

    const blockPositions = bot.findBlocks({
      matching: blocksToCollect.map(type => bot.registry.blocksByName[type]?.id).filter(id => id !== undefined),
      maxDistance: maxSearchDistance,
      count: 100,
    });

    if (blockPositions.length === 0) {
      logger.warn('ACTION', 'collectBlock', `No more ${blockType} blocks found within ${maxSearchDistance} blocks.`);
      return { collected: collectedCount, stopped: false };
    }

    blockPositions.sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b));

    for (const blockPos of blockPositions) {
      //await collectDroppedItems();

      if (shouldStop()) {
        logger.debug('ACTION', 'collectBlock', `Stopping block collection as requested.`);
        return { collected: collectedCount, stopped: true };
      }

      const block = bot.blockAt(blockPos);
      if (!block || block.name === 'air') {
        logger.debug('ACTION', 'collectBlock', `Skipping invalid block at ${blockPos}`);
        continue;
      }

      if (!blocksToCollect.includes(block.name)) {
        logger.debug('ACTION', 'collectBlock', `Skipping non-target block ${block.name} at ${blockPos}`);
        continue;
      }

      try {
        await bot.pathfinder.goto(new GoalBlock(blockPos.x, blockPos.y, blockPos.z));

        if (bot.entity.position.distanceTo(blockPos) > 4) {
          logger.warn('ACTION', 'collectBlock', `Unable to reach block at ${blockPos}. Skipping.`);
          continue;
        }

        logger.debug('ACTION', 'collectBlock', `Attempting to dig ${block.name} at ${blockPos}`);
        await bot.dig(block);
        
        // Update collected count based on inventory
        const newCollectedCount = getCollectedCount();
        const justCollected = newCollectedCount - collectedCount;
        collectedCount = newCollectedCount;
        
        logger.debug('ACTION', 'collectBlock', `Collected ${justCollected} ${block.name} at ${blockPos}. Total: ${collectedCount}/${quantity}`);

        if (bot.inventory.emptySlotCount() === 0) {
          logger.warn('ACTION', 'collectBlock', `Inventory full. Stopping collection.`);
          return { collected: collectedCount, stopped: false, reason: 'inventory_full' };
        }

      } catch (error) {
        logger.error('ACTION', 'collectBlock', `Error collecting ${block.name} at ${blockPos}`, { error: error.message, stack: error.stack });
      }

      if (collectedCount >= quantity) break;
    }

    if (collectedCount > 0 && collectedCount < quantity) {
      maxSearchDistance *= 1.5;
      logger.debug('ACTION', 'collectBlock', `Increasing search distance to ${maxSearchDistance} blocks`);
    }
  }

  const finalCollectedCount = getCollectedCount();
  logger.debug('ACTION', 'collectBlock', `Finished collecting ${blockType}`, { collected: finalCollectedCount, target: quantity });
  return { collected: finalCollectedCount, stopped: false, reason: finalCollectedCount >= quantity ? 'target_reached' : 'no_more_blocks' };
});

actionRegistry.registerAction('buildStructure', async function({ structureType, location }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'buildStructure', `Building structure: ${structureType} at (${location.x}, ${location.y}, ${location.z})`);
  
  const startPos = new Vec3(location.x, location.y, location.z);
  const buildingBlock = bot.registry.blocksByName['stone'];

  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 3; z++) {
        const pos = startPos.offset(x, y, z);
        try {
          await bot.placeBlock(buildingBlock, pos);
          logger.debug('ACTION', 'buildStructure', `Placed block at (${pos.x}, ${pos.y}, ${pos.z})`);
        } catch (error) {
          logger.error('ACTION', 'buildStructure', `Failed to place block at (${pos.x}, ${pos.y}, ${pos.z})`, { error: error.message });
        }
      }
    }
  }

  logger.debug('ACTION', 'buildStructure', `Finished building ${structureType}`);
});

actionRegistry.registerAction('attackEntity', async function({ entityType }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'attackEntity', `Searching for ${entityType} to attack`);
  
  const maxSearchTime = 30000;
  const searchStartTime = Date.now();
  let target = null;

  while (!target && Date.now() - searchStartTime < maxSearchTime) {
    if (shouldStop()) {
      logger.debug('ACTION', 'attackEntity', `Stopping entity search as requested`);
      return { stopped: true };
    }

    target = Object.values(bot.entities).find(entity => 
      entity.name === entityType && bot.entity.position.distanceTo(entity.position) <= 32
    );

    if (!target) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    logger.debug('ACTION', 'attackEntity', `Found ${entityType} at ${target.position}. Moving closer.`);

    try {
      await bot.pathfinder.goto(new GoalNear(target.position.x, target.position.y, target.position.z, 3));
    } catch (error) {
      logger.warn('ACTION', 'attackEntity', `Failed to reach ${entityType}`, { error: error.message });
      target = null;
    }
  }

  if (!target) {
    logger.warn('ACTION', 'attackEntity', `No ${entityType} found within search time`);
    return { stopped: false, reason: 'entity_not_found' };
  }

  logger.debug('ACTION', 'attackEntity', `Attacking ${entityType}`);

  return new Promise((resolve) => {
    const attackInterval = setInterval(() => {
      if (shouldStop()) {
        clearInterval(attackInterval);
        logger.debug('ACTION', 'attackEntity', `Stopped attacking ${entityType} as requested`);
        resolve({ stopped: true });
        return;
      }

      const visibleEntity = bot.entityAtCursor(4);

      if (!target.isValid || target.health <= 0) {
        clearInterval(attackInterval);
        logger.debug('ACTION', 'attackEntity', `${entityType} defeated`);
        resolve({ stopped: false, reason: 'entity_defeated' });
        return;
      }

      if (bot.health <= 5) {
        clearInterval(attackInterval);
        logger.warn('ACTION', 'attackEntity', `Stopping attack due to low health`);
        resolve({ stopped: false, reason: 'low_health' });
        return;
      }

      if (visibleEntity && visibleEntity.id === target.id) {
        bot.attack(target);
      } else {
        const targetPosition = target.position.offset(0, target.height, 0);
        bot.lookAt(targetPosition);
        bot.pathfinder.setGoal(new GoalNear(targetPosition.x, targetPosition.y, targetPosition.z, 3));
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(attackInterval);
      logger.warn('ACTION', 'attackEntity', `Timeout while attacking ${entityType}`);
      resolve({ stopped: false, reason: 'timeout' });
    }, 120000);
  });
});

actionRegistry.registerAction('say', async function({ message }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'say', `Bot saying: ${message}`);
  bot.chat(message);
});

actionRegistry.registerAction('eat', async function({ foodName }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'eat', `Attempting to eat ${foodName}`);
  const food = bot.inventory.items().find(item => item.name === foodName);
  
  if (!food) {
    logger.warn('ACTION', 'eat', `${foodName} not found in inventory`);
    throw new Error(`${foodName} not found in inventory`);
  }

  try {
    await bot.equip(food, 'hand');
    await bot.consume();
    logger.debug('ACTION', 'eat', `Successfully ate ${foodName}`);
  } catch (error) {
    logger.error('ACTION', 'eat', `Failed to eat ${foodName}`, { error: error.message });
    throw error;
  }
});

actionRegistry.registerAction('dropItems', async function({ itemName, quantity }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'dropItems', `Attempting to drop ${quantity} ${itemName}`);
  const item = bot.inventory.items().find(item => item.name === itemName);
  
  if (!item) {
    logger.warn('ACTION', 'dropItems', `${itemName} not found in inventory`);
    throw new Error(`${itemName} not found in inventory`);
  }

  try {
    await bot.toss(item.type, null, quantity);
    logger.debug('ACTION', 'dropItems', `Successfully dropped ${quantity} ${itemName}`);
  } catch (error) {
    logger.error('ACTION', 'dropItems', `Failed to drop ${itemName}`, { error: error.message });
    throw error;
  }
});

actionRegistry.registerAction('equip', async function({ itemName, destination }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'equip', `Attempting to equip ${itemName} to ${destination}`);
  const item = bot.inventory.items().find(item => item.name === itemName);
  
  if (!item) {
    logger.warn('ACTION', 'equip', `${itemName} not found in inventory`);
    throw new Error(`${itemName} not found in inventory`);
  }

  try {
    const validDestination = validateEquipmentSlot(destination);
    await bot.equip(item, validDestination);
    logger.debug('ACTION', 'equip', `Successfully equipped ${itemName} to ${validDestination}`);
  } catch (error) {
    logger.error('ACTION', 'equip', `Failed to equip ${itemName}`, { error: error.message });
    throw error;
  }
});

actionRegistry.registerAction('unequip', async function({ destination }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'unequip', `Attempting to unequip item from ${destination}`);
  try {
    await bot.unequip(destination);
    logger.debug('ACTION', 'unequip', `Successfully unequipped item from ${destination}`);
  } catch (error) {
    logger.error('ACTION', 'unequip', `Failed to unequip from ${destination}`, { error: error.message });
    throw error;
  }
});

actionRegistry.registerAction('jump', async function(parameters, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'jump', 'Attempting to jump');
  try {
    await bot.setControlState('jump', true);
    await new Promise(resolve => setTimeout(resolve, 250));
    await bot.setControlState('jump', false);
    logger.debug('ACTION', 'jump', 'Successfully jumped');
  } catch (error) {
    logger.error('ACTION', 'jump', `Failed to jump`, { error: error.message });
    throw error;
  }
});

actionRegistry.registerAction('craft', async function({ itemName, quantity }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'craft', `Attempting to craft ${quantity} ${itemName}`);
  const recipe = bot.recipesFor(itemName)[0];
  
  if (!recipe) {
    logger.warn('ACTION', 'craft', `No recipe found for ${itemName}`);
    throw new Error(`No recipe found for ${itemName}`);
  }

  try {
    await bot.craft(recipe, quantity);
    logger.debug('ACTION', 'craft', `Successfully crafted ${quantity} ${itemName}`);
  } catch (error) {
    logger.error('ACTION', 'craft', `Failed to craft ${itemName}`, { error: error.message });
    throw error;
  }
});

// High-priority action: Immediately destroys a goal
actionRegistry.registerAction('destroyGoal', async function({ goalId }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'destroyGoal', `Attempting to destroy goal with ID: ${goalId}`);
  const destroyed = goalManager.destroyGoal(goalId);
  return { destroyed, goalId };
});

// High-priority action: Immediately pauses a goal
actionRegistry.registerAction('pauseGoal', async function({ goalId }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'pauseGoal', `Attempting to pause goal with ID: ${goalId}`);
  const paused = goalManager.pauseGoal(goalId);
  return { paused, goalId };
});

// High-priority action: Immediately resumes a paused goal
actionRegistry.registerAction('resumeGoal', async function({ goalId }, bot, goalManager, shouldStop) {
  logger.debug('ACTION', 'resumeGoal', `Attempting to resume goal with ID: ${goalId}`);
  const resumed = goalManager.resumeGoal(goalId);
  return { resumed, goalId };
});

module.exports = actionRegistry;