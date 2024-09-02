const { logger } = require('./utils');

class Perception {
    constructor(bot, goalManager) {
      this.bot = bot;
      this.goalManager = goalManager;
      logger.info('Perception instance created');
    }
  
    async getWorldState() {
      logger.debug('Getting world state');
      const nearbyEntities = this.getNearbyEntitiesSummary();
      const nearbyBlocks = this.getNearbyBlocksSummary();

      const worldState = {
        player: this.getPlayerSummary(),
        inventory: this.getInventorySummary(),
        nearbyEntities,
        nearbyBlocks,
        environment: this.getEnvironmentSummary(),
        currentGoal: this.goalManager.getCurrentGoal(),
        pendingGoals: this.goalManager.getAllGoals().slice(1),
      };

      logger.debug(`World state: ${JSON.stringify(worldState)}`);
      return worldState;
    }

    getPlayerSummary() {
      return {
        position: this.roundPosition(this.bot.entity.position),
        health: Math.round(this.bot.health),
        food: Math.round(this.bot.food),
        experience: Math.round(this.bot.experience.level),
      };
    }

    getInventorySummary() {
      const items = this.bot.inventory.items();
      const summary = {};
      items.forEach(item => {
        if (summary[item.name]) {
          summary[item.name] += item.count;
        } else {
          summary[item.name] = item.count;
        }
      });
      return summary;
    }

    getNearbyEntitiesSummary() {
      const entities = Object.values(this.bot.entities);
      const summary = {
        players: [],
        mobs: {},
        items: {},
      };

      entities.forEach(entity => {
        const distance = entity.position.distanceTo(this.bot.entity.position);
        if (distance > 16) return; // Only consider entities within 16 blocks

        if (entity.type === 'player' && entity.username !== this.bot.username) {
          summary.players.push({
            name: entity.username,
            distance: Math.round(distance),
          });
        } else if (entity.type === 'mob') {
          summary.mobs[entity.mobType] = (summary.mobs[entity.mobType] || 0) + 1;
        } else if (entity.type === 'object') {
          summary.items[entity.objectType] = (summary.items[entity.objectType] || 0) + 1;
        }
      });

      return summary;
    }

    getNearbyBlocksSummary() {
      const blocks = this.bot.findBlocks({
        matching: () => true,
        maxDistance: 16,
        count: 100,
      });

      const summary = {};
      blocks.forEach(pos => {
        const block = this.bot.blockAt(pos);
        summary[block.name] = (summary[block.name] || 0) + 1;
      });

      return summary;
    }

    getEnvironmentSummary() {
      return {
        time: this.getDayTime(),
        isRaining: this.bot.isRaining,
        biome: this.bot.game.dimension,
      };
    }

    getDayTime() {
      const time = this.bot.time.timeOfDay;
      if (time < 1000) return "early morning";
      if (time < 6000) return "morning";
      if (time < 12000) return "midday";
      if (time < 13000) return "early evening";
      if (time < 18000) return "evening";
      return "night";
    }

    roundPosition(pos) {
      return {
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        z: Math.round(pos.z),
      };
    }
}

module.exports = Perception;