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

  // Set duration to effectively infinite if stopAtPlayerPosition is true
  const isDurationZero = duration === 0 || duration === undefined || duration === null;
  const effectiveDuration = isDurationZero || stopAtPlayerPosition ? 2147483647 : duration;

  logger.info('ActionExecutor', `Starting to follow player: ${username} for ${stopAtPlayerPosition ? 'infinite' : effectiveDuration}ms`);

  return new Promise((resolve) => {
    const startTime = Date.now();
    let closePositionCount = 0;
    const followInterval = setInterval(() => {
      if (shouldStop()) {
        clearInterval(followInterval);
        logger.info('ActionExecutor', `Stopped following player: ${username}`);
        resolve({ stopped: true });
        return;
      }

      const currentTime = Date.now();
      if (currentTime - startTime >= effectiveDuration) {
        clearInterval(followInterval);
        logger.info('ActionExecutor', `Follow duration expired for player: ${username}`);
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
        if (closePositionCount >= 5) { // Check if bot has been close for 5 consecutive checks
          const finalDistance = bot.entity.position.distanceTo(targetPlayer.position);
          if (finalDistance <= 3) {
            clearInterval(followInterval);
            logger.info('ActionExecutor', `Reached player ${username}'s position (distance: ${finalDistance.toFixed(2)})`);
            resolve({ stopped: false, reason: 'reached_position', distance: finalDistance });
            return;
          } else {
            closePositionCount = 0; // Reset if the final check fails
          }
        }
      } else {
        closePositionCount = 0;
      }
    }, 100);

    // Only set a timeout if not stopping at player position
    if (!stopAtPlayerPosition) {
      setTimeout(() => {
        clearInterval(followInterval);
        logger.info('ActionExecutor', `Finished following player: ${username}`);
        resolve({ stopped: false, reason: 'duration_expired' });
      }, effectiveDuration);
    }
  });
});

actionRegistry.registerAction('collectBlock', async function({ blockType, quantity }, bot, goalManager, shouldStop) {
  const blocksToCollect = blockTypeMapping[blockType] || [blockType];
  let collectedCount = 0;
  let maxSearchDistance = 32;

  logger.info('ActionExecutor', `Starting to collect ${quantity} ${blockType}`);

  async function collectDroppedItems() {
    logger.info('ActionExecutor', `Collecting dropped items`);
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
        logger.info('ActionExecutor', `Collected dropped ${item.entityType} (${collectedCount}/${quantity})`);
      } catch (error) {
        logger.error('ActionExecutor', `Failed to collect dropped ${item.entityType}: ${error.message}`);
      }

      if (collectedCount >= quantity) return;
    }
  }



  while (collectedCount < quantity) {
    if (shouldStop()) {
      logger.info('ActionExecutor', `Stopping block collection as requested.`);
      return { collected: collectedCount, stopped: true };
    }

    // Collect any dropped items first
    if (collectedCount >= quantity) break;

    // Find nearest blocks
    const blockPositions = bot.findBlocks({
      matching: blocksToCollect.map(type => bot.registry.blocksByName[type]?.id).filter(id => id !== undefined),
      maxDistance: maxSearchDistance,
      count: 100,
    });

    if (blockPositions.length === 0) {
      logger.warn('ActionExecutor', `No more ${blockType} blocks found within ${maxSearchDistance} blocks.`);
      return { collected: collectedCount, stopped: false };
    }

    // Sort blocks by distance
    blockPositions.sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b));

    for (const blockPos of blockPositions) {
      await collectDroppedItems();

      if (shouldStop()) {
        logger.info('ActionExecutor', `Stopping block collection as requested.`);
        return { collected: collectedCount, stopped: true };
      }

      const block = bot.blockAt(blockPos);
      if (!block || block.name === 'air') {
        logger.debug('ActionExecutor', `Skipping invalid block at ${blockPos}`);
        continue;
      }

      if (!blocksToCollect.includes(block.name)) {
        logger.debug('ActionExecutor', `Skipping non-target block ${block.name} at ${blockPos}`);
        continue;
      }

      try {
        // Move to the block
        await bot.pathfinder.goto(new GoalBlock(blockPos.x, blockPos.y, blockPos.z));

        // Check if we can actually reach the block
        if (bot.entity.position.distanceTo(blockPos) > 4) {
          logger.warn('ActionExecutor', `Unable to reach block at ${blockPos}. Skipping.`);
          continue;
        }

        // Dig the block
        logger.info('ActionExecutor', `Attempting to dig ${block.name} at ${blockPos}`);
        await bot.dig(block);
        await collectDroppedItems();
        collectedCount++;
        logger.info('ActionExecutor', `Collected dropped items after digging ${block.name} at ${blockPos}`);
        logger.info('ActionExecutor', `Collected ${collectedCount}/${quantity}`);
        // Check if inventory is full
        if (bot.inventory.emptySlotCount() === 0) {
          logger.warn('ActionExecutor', `Inventory full. Stopping collection.`);
          return { collected: collectedCount, stopped: false, reason: 'inventory_full' };
        }

      } catch (error) {
        logger.error('ActionExecutor', `Error collecting ${block.name} at ${blockPos}: ${error.message}`);
      }

      if (collectedCount >= quantity) break;
    }

    // If we've collected some blocks but not all, and can't find more nearby, increase search distance
    if (collectedCount > 0 && collectedCount < quantity) {
      maxSearchDistance *= 1.5;
      logger.info('ActionExecutor', `Increasing search distance to ${maxSearchDistance} blocks`);
    }
  }

  logger.info('ActionExecutor', `Finished collecting ${blockType}. Total collected: ${collectedCount}`);
  return { collected: collectedCount, stopped: false };
});

actionRegistry.registerAction('buildStructure', async function({ structureType, location }, bot, goalManager, shouldStop) {
  logger.info('ActionExecutor', `Building structure: ${structureType} at (${location.x}, ${location.y}, ${location.z}).`);
  
  // Basic implementation for a 3x3x3 cube
  const startPos = new Vec3(location.x, location.y, location.z);
  const buildingBlock = bot.registry.blocksByName['stone'];

  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 3; z++) {
        const pos = startPos.offset(x, y, z);
        try {
          await bot.placeBlock(buildingBlock, pos);
          logger.info('ActionExecutor', `Placed block at (${pos.x}, ${pos.y}, ${pos.z})`);
        } catch (error) {
          logger.error('ActionExecutor', `Failed to place block at (${pos.x}, ${pos.y}, ${pos.z}): ${error.message}`);
        }
      }
    }
  }

  logger.info('ActionExecutor', `Finished building ${structureType}`);
});

actionRegistry.registerAction('attackEntity', async function({ entityType }, bot, goalManager, shouldStop) {
  logger.info('ActionExecutor', `Searching for ${entityType} to attack`);
  
  const maxSearchTime = 30000; // Maximum search time: 30 seconds
  const searchStartTime = Date.now();
  let target = null;

  while (!target && Date.now() - searchStartTime < maxSearchTime) {
    if (shouldStop()) {
      logger.info('ActionExecutor', `Stopping entity search as requested`);
      return { stopped: true };
    }

    target = Object.values(bot.entities).find(entity => 
      entity.name === entityType && bot.entity.position.distanceTo(entity.position) <= 32
    );

    if (!target) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before searching again
      continue;
    }

    logger.info('ActionExecutor', `Found ${entityType} at ${target.position}. Moving closer.`);

    try {
      await bot.pathfinder.goto(new GoalNear(target.position.x, target.position.y, target.position.z, 3));
    } catch (error) {
      logger.warn('ActionExecutor', `Failed to reach ${entityType}: ${error.message}`);
      target = null; // Reset target and continue searching
    }
  }

  if (!target) {
    logger.warn('ActionExecutor', `No ${entityType} found within search time`);
    return { stopped: false, reason: 'entity_not_found' };
  }

  logger.info('ActionExecutor', `Attacking ${entityType}`);

  return new Promise((resolve) => {
    const attackInterval = setInterval(() => {
      if (shouldStop()) {
        clearInterval(attackInterval);
        logger.info('ActionExecutor', `Stopped attacking ${entityType} as requested`);
        resolve({ stopped: true });
        return;
      }

      const visibleEntity = bot.entityAtCursor(4); // Check if entity is visible within 4 blocks

      if (!target.isValid || target.health <= 0) {
        clearInterval(attackInterval);
        logger.info('ActionExecutor', `${entityType} defeated`);
        resolve({ stopped: false, reason: 'entity_defeated' });
        return;
      }

      if (bot.health <= 5) {
        clearInterval(attackInterval);
        logger.warn('ActionExecutor', `Stopping attack due to low health`);
        resolve({ stopped: false, reason: 'low_health' });
        return;
      }

      if (visibleEntity && visibleEntity.id === target.id) {
        bot.attack(target);
      } else {
        // If entity is not visible, try to move closer
        const targetPosition = target.position.offset(0, target.height, 0);
        bot.lookAt(targetPosition);
        bot.pathfinder.setGoal(new GoalNear(targetPosition.x, targetPosition.y, targetPosition.z, 3));
      }
    }, 1000);

    // Stop attacking after 2 minutes if the entity is not defeated
    setTimeout(() => {
      clearInterval(attackInterval);
      logger.warn('ActionExecutor', `Timeout while attacking ${entityType}`);
      resolve({ stopped: false, reason: 'timeout' });
    }, 120000);
  });
});

actionRegistry.registerAction('say', async function({ message }, bot, goalManager, shouldStop) {
  logger.info('ActionExecutor', `Bot saying: ${message}`);
  bot.chat(message);
});

actionRegistry.registerAction('eat', async function({ foodName }, bot, goalManager, shouldStop) {
  logger.info('ActionExecutor', `Attempting to eat ${foodName}`);
  const food = bot.inventory.items().find(item => item.name === foodName);
  
  if (!food) {
    logger.warn('ActionExecutor', `${foodName} not found in inventory`);
    throw new Error(`${foodName} not found in inventory`);
  }

  try {
    await bot.equip(food, 'hand');
    await bot.consume();
    logger.info('ActionExecutor', `Successfully ate ${foodName}`);
  } catch (error) {
    logger.error('ActionExecutor', `Failed to eat ${foodName}: ${error.message}`);
    throw error;
  }
});

actionRegistry.registerAction('dropItems', async function({ itemName, quantity }, bot, goalManager, shouldStop) {
  logger.info('ActionExecutor', `Attempting to drop ${quantity} ${itemName}`);
  const item = bot.inventory.items().find(item => item.name === itemName);
  
  if (!item) {
    logger.warn('ActionExecutor', `${itemName} not found in inventory`);
    throw new Error(`${itemName} not found in inventory`);
  }

  try {
    await bot.toss(item.type, null, quantity);
    logger.info('ActionExecutor', `Successfully dropped ${quantity} ${itemName}`);
  } catch (error) {
    logger.error('ActionExecutor', `Failed to drop ${itemName}: ${error.message}`);
    throw error;
  }
});

actionRegistry.registerAction('equip', async function({ itemName, destination }, bot, goalManager, shouldStop) {
  logger.info('ActionExecutor', `Attempting to equip ${itemName} to ${destination}`);
  const item = bot.inventory.items().find(item => item.name === itemName);
  
  if (!item) {
    logger.warn('ActionExecutor', `${itemName} not found in inventory`);
    throw new Error(`${itemName} not found in inventory`);
  }

  try {
    const validDestination = validateEquipmentSlot(destination);
    await bot.equip(item, validDestination);
    logger.info('ActionExecutor', `Successfully equipped ${itemName} to ${validDestination}`);
  } catch (error) {
    logger.error('ActionExecutor', `Failed to equip ${itemName}: ${error.message}`);
    throw error;
  }
});

actionRegistry.registerAction('unequip', async function({ destination }, bot, goalManager, shouldStop) {
  logger.info('ActionExecutor', `Attempting to unequip item from ${destination}`);
  try {
    await bot.unequip(destination);
    logger.info('ActionExecutor', `Successfully unequipped item from ${destination}`);
  } catch (error) {
    logger.error('ActionExecutor', `Failed to unequip from ${destination}: ${error.message}`);
    throw error;
  }
});

actionRegistry.registerAction('jump', async function(parameters, bot, goalManager, shouldStop) {
  logger.info('ActionExecutor', 'Attempting to jump');
  try {
    await bot.setControlState('jump', true);
    await new Promise(resolve => setTimeout(resolve, 250)); // Jump duration
    await bot.setControlState('jump', false);
    logger.info('ActionExecutor', 'Successfully jumped');
  } catch (error) {
    logger.error('ActionExecutor', `Failed to jump: ${error.message}`);
    throw error;
  }
});

actionRegistry.registerAction('craft', async function({ itemName, quantity }, bot, goalManager, shouldStop) {
  logger.info('ActionExecutor', `Attempting to craft ${quantity} ${itemName}`);
  const recipe = bot.recipesFor(itemName)[0];
  
  if (!recipe) {
    logger.warn('ActionExecutor', `No recipe found for ${itemName}`);
    throw new Error(`No recipe found for ${itemName}`);
  }

  try {
    await bot.craft(recipe, quantity);
    logger.info('ActionExecutor', `Successfully crafted ${quantity} ${itemName}`);
  } catch (error) {
    logger.error('ActionExecutor', `Failed to craft ${itemName}: ${error.message}`);
    throw error;
  }
});

actionRegistry.registerAction('cancelGoalById', async function({ goalId }, bot, goalManager, shouldStop) {
  logger.info('ActionExecutor', `Attempting to cancel goal with ID: ${goalId}`);
  const cancelledGoal = goalManager.cancelGoalById(goalId);
  if (cancelledGoal) {
    logger.info('ActionExecutor', `Successfully cancelled goal with ID: ${goalId}`);
    return { cancelled: true, goal: cancelledGoal };
  } else {
    logger.warn('ActionExecutor', `Failed to cancel goal with ID: ${goalId}. Goal not found.`);
    return { cancelled: false, goal: null };
  }
});

module.exports = actionRegistry;