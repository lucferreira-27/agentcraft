const { logger } = require('./utils');

class Perception {
    constructor(bot, goalManager) {
      this.bot = bot;
      this.goalManager = goalManager;
      logger.info('Perception instance created');
    }
  
    async getWorldState() {
      logger.debug('Getting world state');
      const nearbyEntities = Object.values(this.bot.entities)
        .filter(entity => entity.type !== 'object')
        .map(entity => ({
          type: entity.type,
          name: entity.name,
          position: entity.position,
          distance: entity.position.distanceTo(this.bot.entity.position),
        }));
  
      const nearbyBlocks = this.bot.findBlocks({
        matching: () => true,
        maxDistance: 16,
        count: 10,
      }).map(pos => {
        const block = this.bot.blockAt(pos);
        return {
          name: block.name,
          position: block.position,
        };
      });
  
      const worldState = {
        player: {
          position: this.bot.entity.position,
          health: this.bot.health,
          food: this.bot.food,
          experience: this.bot.experience,
        },
        inventory: this.bot.inventory.items().map(item => ({
          name: item.name,
          count: item.count,
        })),
        nearbyEntities,
        nearbyBlocks,
        time: this.bot.time.timeOfDay,
        isRaining: this.bot.isRaining,
        currentGoal: this.goalManager.getCurrentGoal(),
        pendingGoals: this.goalManager.getAllGoals().slice(1),
      };
  
      logger.debug(`World state: ${JSON.stringify(worldState)}`);
      return worldState;
    }
  }
  
  module.exports = Perception;