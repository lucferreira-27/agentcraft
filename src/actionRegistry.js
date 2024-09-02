const { logger } = require('./utils');

class ActionRegistry {
  constructor() {
    this.actions = new Map();
  }

  register(name, metadata, handler) {
    this.actions.set(name, { metadata, handler });
  }

  get(name) {
    return this.actions.get(name);
  }

  getAll() {
    return Array.from(this.actions.entries()).map(([name, { metadata }]) => ({
      name,
      ...metadata
    }));
  }
}

const registry = new ActionRegistry();

module.exports = { registry };