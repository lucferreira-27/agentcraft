const bot = require('./bot');
const { goals: { GoalNear, GoalBlock, GoalXZ, GoalY } } = require('mineflayer-pathfinder');
const logger = require('./logger');
const Vec3 = require('vec3');

// Mapping of general terms to specific Minecraft block types
const blockTypeMapping = {
  wood: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
  dirt: ['dirt', 'grass_block', 'podzol'],
  stone: ['stone', 'cobblestone', 'granite', 'diorite', 'andesite'],
  sand: ['sand', 'red_sand'],
  gravel: ['gravel'],
  // Add more mappings as needed
};

const actionRegistry = {
  moveTo: async ({ position }, shouldStop) => {
    logger.info('ActionExecutor', `Moving to position: (${position.x}, ${position.y}, ${position.z})`);
    const goal = new GoalNear(position.x, position.y, position.z, 1);
    bot.pathfinder.setGoal(goal);

    return new Promise((resolve, reject) => {
      bot.once('goal_reached', () => {
        logger.info('ActionExecutor', `Reached position (${position.x}, ${position.y}, ${position.z}).`);
        resolve();
      });

      bot.once('path_update', (r) => {
        if (r.status === 'noPath') {
          logger.warn('ActionExecutor', 'No path to the target location.');
          reject(new Error('No path to the target location.'));
        }
      });

      setTimeout(() => {
        logger.warn('ActionExecutor', 'Timeout while moving to position.');
        reject(new Error('Timeout while moving to position.'));
      }, 60000);
    });
  },

  followPlayer: async ({ username, stopAtPlayerPosition, duration = 10000 }, shouldStop) => {
    const targetPlayer = bot.players[username]?.entity;
    if (!targetPlayer) throw new Error(`Player ${username} not found.`);

    // Set duration to effectively infinite if stopAtPlayerPosition is true
    const effectiveDuration = stopAtPlayerPosition ? Number.MAX_SAFE_INTEGER : duration;

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
  },

  collectBlock: async ({ blockType, quantity }, shouldStop) => {
    const blocksToCollect = blockTypeMapping[blockType] || [blockType];
    let collectedCount = 0;

    for (const currentBlockType of blocksToCollect) {
      if (shouldStop()) {
        logger.info('ActionExecutor', `Stopping block collection as requested.`);
        return { collected: collectedCount, stopped: true };
      }

      const blocks = bot.findBlocks({
        matching: bot.registry.blocksByName[currentBlockType]?.id,
        maxDistance: 32,
        count: quantity - collectedCount,
      });

      if (blocks.length === 0) {
        logger.info('ActionExecutor', `No ${currentBlockType} blocks found nearby. Trying next type if available.`);
        continue;
      }

      logger.info('ActionExecutor', `Found ${blocks.length} ${currentBlockType} blocks. Collecting...`);

      for (const blockPos of blocks) {
        if (shouldStop()) {
          logger.info('ActionExecutor', `Stopping block collection as requested.`);
          return { collected: collectedCount, stopped: true };
        }

        if (collectedCount >= quantity) break;

        const block = bot.blockAt(blockPos);
        if (!block) continue;

        try {
          await bot.pathfinder.goto(new GoalBlock(block.position.x, block.position.y, block.position.z));
          await bot.dig(block);
          collectedCount++;
          logger.info('ActionExecutor', `Collected ${currentBlockType} (${collectedCount}/${quantity})`);
        } catch (error) {
          logger.error('ActionExecutor', `Failed to collect ${currentBlockType}: ${error.message}`);
        }
      }

      if (collectedCount >= quantity) break;
    }

    if (collectedCount === 0) {
      logger.warn('ActionExecutor', `No ${blockType} blocks found nearby.`);
      throw new Error(`No ${blockType} blocks found nearby.`);
    } else if (collectedCount < quantity) {
      logger.info('ActionExecutor', `Partially completed ${blockType} collection. Collected ${collectedCount}/${quantity}`);
    } else {
      logger.info('ActionExecutor', `Finished collecting ${blockType}`);
    }

    return { collected: collectedCount, stopped: false };
  },

  buildStructure: async ({ structureType, location }) => {
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
  },

  attackEntity: async ({ entityType }) => {
    const target = Object.values(bot.entities).find(entity => entity.name === entityType);
    if (!target) throw new Error(`No entity of type ${entityType} found nearby.`);

    logger.info('ActionExecutor', `Attacking ${entityType}`);

    return new Promise((resolve, reject) => {
      const attackInterval = setInterval(() => {
        if (target.isValid) {
          bot.attack(target);
        } else {
          clearInterval(attackInterval);
          logger.info('ActionExecutor', `${entityType} defeated`);
          resolve();
        }
      }, 1000);

      // Stop attacking after 2 minutes if the entity is not defeated
      setTimeout(() => {
        clearInterval(attackInterval);
        logger.warn('ActionExecutor', `Timeout while attacking ${entityType}`);
        reject(new Error(`Timeout while attacking ${entityType}`));
      }, 120000);
    });
  },


  say: async ({ message }) => {
    logger.info('ActionExecutor', `Bot saying: ${message}`);
    bot.chat(message);
  },

  eat: async ({ foodName }, shouldStop) => {
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
  },

  dropItems: async ({ itemName, quantity }, shouldStop) => {
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
  },

  equip: async ({ itemName, destination }, shouldStop) => {
    logger.info('ActionExecutor', `Attempting to equip ${itemName} to ${destination}`);
    const item = bot.inventory.items().find(item => item.name === itemName);
    
    if (!item) {
      logger.warn('ActionExecutor', `${itemName} not found in inventory`);
      throw new Error(`${itemName} not found in inventory`);
    }

    try {
      await bot.equip(item, destination);
      logger.info('ActionExecutor', `Successfully equipped ${itemName} to ${destination}`);
    } catch (error) {
      logger.error('ActionExecutor', `Failed to equip ${itemName}: ${error.message}`);
      throw error;
    }
  },

  unequip: async ({ destination }, shouldStop) => {
    logger.info('ActionExecutor', `Attempting to unequip item from ${destination}`);
    try {
      await bot.unequip(destination);
      logger.info('ActionExecutor', `Successfully unequipped item from ${destination}`);
    } catch (error) {
      logger.error('ActionExecutor', `Failed to unequip from ${destination}: ${error.message}`);
      throw error;
    }
  },

  jump: async () => {
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
  },

  moveToCoordinates: async ({ x, y, z }, shouldStop) => {
    logger.info('ActionExecutor', `Moving to coordinates: (${x}, ${y}, ${z})`);
    const goal = new GoalNear(x, y, z, 1);
    bot.pathfinder.setGoal(goal);

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (shouldStop()) {
          clearInterval(checkInterval);
          bot.pathfinder.setGoal(null);
          logger.info('ActionExecutor', 'Movement stopped as requested');
          resolve({ stopped: true });
        }
      }, 100);

      bot.once('goal_reached', () => {
        clearInterval(checkInterval);
        logger.info('ActionExecutor', `Reached coordinates (${x}, ${y}, ${z})`);
        resolve({ stopped: false });
      });

      bot.once('path_update', (r) => {
        if (r.status === 'noPath') {
          clearInterval(checkInterval);
          logger.warn('ActionExecutor', 'No path to the target location');
          reject(new Error('No path to the target location'));
        }
      });

      setTimeout(() => {
        clearInterval(checkInterval);
        logger.warn('ActionExecutor', 'Timeout while moving to coordinates');
        reject(new Error('Timeout while moving to coordinates'));
      }, 60000);
    });
  },

  craft: async ({ itemName, quantity }, shouldStop) => {
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
  },
};

module.exports = actionRegistry;