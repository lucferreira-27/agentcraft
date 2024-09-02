const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const LLM = require('./llm');
const Actions = require('./actions');
const Perception = require('./perception');
const GoalManager = require('./goalManager');
const { logger } = require('./utils');
const { registry } = require('./actionRegistry');

class Agent {
  constructor(options, providerName) {
    this.options = options;
    this.bot = null;
    this.llm = new LLM(providerName);
    this.goalManager = new GoalManager();
    this.actions = null;
    this.perception = null;
    this.lastInteractingPlayer = null;
    logger.info(`Agent instance created with ${providerName} provider`);
  }

  connect() {
    logger.info('Connecting to Minecraft server...');
    this.bot = mineflayer.createBot(this.options);
    this.bot.loadPlugin(pathfinder);
    this.actions = new Actions(this.bot, this.goalManager, this);
    this.perception = new Perception(this.bot, this.goalManager); // Pass goalManager here

    this.bot.once('spawn', () => {
      logger.info('Agent spawned in the world');
      this.bot.chat('Hello! I am an AI agent. How can I assist you today?');
    });

    this.bot.on('chat', async (username, message) => {
      if (username === this.bot.username) return;
      this.lastInteractingPlayer = username;
      logger.info(`Received chat message from ${username}: ${message}`);
      const perception = await this.perception.getWorldState();
      const prompt = this.createPrompt(username, message, perception);
      const response = await this.llm.getResponse(prompt);

      await this.handleResponse(response);
    });

    this.bot.on('error', (error) => {
      logger.error(`Minecraft bot error: ${error.message}`);
    });
  }

  createPrompt(username, message, perception) {
    logger.debug('Creating prompt for LLM');
    const availableActions = registry.getAll();
    const currentGoals = this.goalManager.getAllGoals();
    return {
      role: 'system',
      content: `You are an AI agent named ${this.bot.username} in a Minecraft world. Your role is to assist players and perform actions in the game. 

Current situation:
- A player named ${username} has sent you a message.
- This player's username is always correct and available to you.
- You should respond to their message and consider performing actions in the game world if appropriate.

Player's message: "${message}"

Your current world state:
${JSON.stringify(perception, null, 2)}

Your current goals:
${JSON.stringify(currentGoals, null, 2)}

Available actions you can perform:
${JSON.stringify(availableActions, null, 2)}

Instructions:
1. Analyze the player's message, the current world state, and your current goals.
2. Formulate a helpful and friendly response to the player.
3. If appropriate, choose an action to perform based on the player's request, the current situation, or your current goals.
4. Respond using the following JSON format:

{
  "message": "Your response to the player",
  "action": "actionName",
  "args": ["arg1", "arg2", ...]
}

If no action is needed, omit the "action" and "args" fields.

Remember:
- You are the AI agent, not the player. Address the player in your response.
- Be helpful, friendly, and concise in your responses.
- Only suggest actions that are available and relevant to the situation.
- Consider your current goals when deciding on actions.
- If you're unsure about something, it's okay to ask the player for clarification.
- You can use the 'stopCurrentAction' or 'clearAllGoals' actions if needed.`
    };
  }

  async handleResponse(response) {
    try {
      logger.info(`Sending chat message: ${response.message}`);
      this.bot.chat(response.message);

      if (response.action) {
        if (response.action === 'stopCurrentAction') {
          logger.info(`Stopping current action`);
          await this.actions.stopCurrentAction();
        } else {
          logger.info(`Adding goal: ${response.action}`);
          this.goalManager.addGoal(response.action, response.args || []);
          await this.goalManager.executeNextGoal(this.actions);
        }
      }
    } catch (error) {
      logger.error(`Error handling LLM response: ${error.message}`);
      this.bot.chat("I'm sorry, I couldn't process that request properly.");
    }
  }
}

module.exports = Agent;