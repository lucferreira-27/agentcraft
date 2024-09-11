const Vec3 = require('vec3');
const { goals, Movements } = require('mineflayer-pathfinder');
const { logger } = require('../utils');
const { getSpecificBlockTypes } = require('../blockLabels');

function registerMovementActions(registry, bot, goalManager) {
  registry.register('moveToBlock', {
    description: 'Move to a specific block type',
    parameters: [
      { name: 'blockType', type: 'string', description: 'The type of block to move to' },
      { name: 'count', type: 'number', description: 'Number of blocks to move to', default: 1 }
    ],
    stopHandler: () => {
      bot.pathfinder.stop();
      logger.debug("Stopped pathfinding");
    }
  }, async (blockType, count = 1, timeout = 60000) => {
    logger.info(`Moving to ${count} ${blockType}`);
    const specificBlockTypes = getSpecificBlockTypes(blockType);
    logger.debug(`Specific block types: ${specificBlockTypes}`);
    const ids = specificBlockTypes.map(name => bot.registry.blocksByName[name].id);
    logger.debug(`Block IDs: ${ids}`);
    const blocks = bot.findBlocks({
      matching: ids,
      maxDistance: 128,
      count: count,
    });

    if (blocks.length === 0) {
      logger.warn(`No ${blockType} found nearby`);
      return false;
    }

    const movements = new Movements(bot);
    movements.allowParkour = true;
    movements.canDig = true;
    bot.pathfinder.setMovements(movements);

    for (const block of blocks) {
      if (goalManager.getCurrentGoal()?.status === 'interrupted') {
        logger.info(`Movement to ${blockType} interrupted`);
        return false;
      }

      const goal = new goals.GoalGetToBlock(block.x, block.y, block.z);
      const startPosition = bot.entity.position.clone();
      const startDistance = startPosition.distanceTo(new Vec3(block.x, block.y, block.z));
      let lastProgress = 0;
      let stuckCounter = 0;
      const startTime = Date.now();

      const updateProgress = (complete=false) => {
        if (complete) {
          return 100;
        }
        const currentPosition = bot.entity.position;
        const currentDistance = currentPosition.distanceTo(new Vec3(block.x, block.y, block.z));
        const progress = Math.min(100, Math.round((1 - currentDistance / startDistance) * 100));
        if (progress > lastProgress) {
          logger.info(`Moving to ${blockType}... Progress: ${progress}%`);
          lastProgress = progress;
          stuckCounter = 0;
        } else {
          stuckCounter++;
        }
        return progress;
      };

      const progressInterval = setInterval(updateProgress, 1000);

      try {
        await new Promise((resolve, reject) => {
          bot.pathfinder.goto(goal).then(resolve).catch(reject);

          const timeoutId = setTimeout(() => {
            bot.pathfinder.stop();
            reject(new Error('Movement timeout'));
          }, timeout);

          const checkProgress = setInterval(() => {
            if (stuckCounter >= 5) {
              clearInterval(checkProgress);
              clearTimeout(timeoutId);
              reject(new Error('Stuck during movement'));
            }
          }, 1000);

          bot.once('goal_reached', () => {
            clearInterval(checkProgress);
            clearTimeout(timeoutId);
            updateProgress(true);
            resolve();
          });
        });

        logger.info(`Reached ${blockType}`);
      } catch (error) {
        logger.warn(`Failed to reach ${blockType}: ${error.message}`);
        if (error.message === 'Stuck during movement') {
          await handleStuckSituation(bot, block);
        }
        return false;
      } finally {
        clearInterval(progressInterval);
      }
    }

    return true;
  });

  registry.register('followPlayer', {
    description: 'Follow a player',
    parameters: [
      { name: 'playerName', type: 'string', description: 'The name of the player to follow' }
    ],
    stopHandler: () => {
      bot.pathfinder.stop();
      logger.debug("Stopped following");
    }
  }, async (playerName) => {
    logger.info(`Following player ${playerName}`);
    const player = bot.players[playerName];
    if (!player) {
      logger.warn(`Can't see ${playerName}. Are you sure that's the correct username?`);
      return false;
    }

    const goal = new goals.GoalFollow(player.entity, 2);
    bot.pathfinder.setGoal(goal, true);
    logger.info(`Now following ${player.username}`);

    while (goalManager.getCurrentGoal()?.status !== 'interrupted') {
      if (!bot.players[player.username]) {
        logger.info(`Lost sight of ${player.username}. Stopping follow.`);
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    bot.pathfinder.stop();
    logger.info(`Stopped following ${player.username}`);
    return true;
  });
}

async function handleStuckSituation(bot, targetBlock) {
  logger.info('Attempting to handle stuck situation');
  const currentPosition = bot.entity.position;
  const targetVec3 = new Vec3(targetBlock.x, targetBlock.y, targetBlock.z);

  // Step back
  const stepBackDirection = currentPosition.minus(targetVec3).normalize();
  const stepBackPosition = currentPosition.plus(stepBackDirection.scaled(3));
  await bot.pathfinder.goto(new goals.GoalNear(stepBackPosition.x, stepBackPosition.y, stepBackPosition.z, 1));

  // Try alternative approaches
  const offsets = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }
  ];

  for (const offset of offsets) {
    const alternativePosition = targetVec3.plus(new Vec3(offset.x, offset.y, offset.z));
    try {
      await bot.pathfinder.goto(new goals.GoalNear(alternativePosition.x, alternativePosition.y, alternativePosition.z, 1));
      logger.info('Successfully reached alternative position');
      return;
    } catch (error) {
      logger.debug(`Alternative approach failed, trying next`);
    }
  }

  logger.warn('All alternative approaches failed');
}

module.exports = registerMovementActions;