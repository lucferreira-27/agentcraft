const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const LLM = require('./llm');
const Actions = require('./actions');
const Perception = require('./perception');
const GoalManager = require('./goalManager');
const ConversationMemory = require('./conversationMemory');
const JournalKeeper = require('./journalKeeper');
const MetaAgent = require('./metaAgent');
const { logger } = require('./utils');
const { registry } = require('./actionRegistry');
const path = require('path');

class Agent {
  constructor(options, providerName) {
    this.options = options;
    this.bot = null;
    this.llm = new LLM(providerName);
    this.goalManager = new GoalManager();
    this.actions = null;
    this.perception = null;
    this.lastInteractingPlayer = null;
    this.conversationMemory = new ConversationMemory();
    this.journalKeeper = new JournalKeeper(
      options.username,
      path.join(__dirname, '..', 'data', `${options.username}_journal.json`),
      providerName
    );
    this.isWritingJournal = false;
    this.metaAgent = new MetaAgent(this, providerName);
    logger.info(`Agent instance created with ${providerName} provider`);
  }

  async connect() {
    logger.info('Connecting to Minecraft server...');
    this.bot = mineflayer.createBot(this.options);
    this.bot.loadPlugin(pathfinder);
    this.actions = new Actions(this.bot, this.goalManager, this);
    this.perception = new Perception(this.bot, this.goalManager);

    await this.journalKeeper.loadJournal();

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

      await this.handleResponse(response, username, message);
    });

    this.bot.on('end', () => {
      this.writeJournalEntry(true);
    });

    this.bot.on('error', (error) => {
      logger.error(`Minecraft bot error: ${error.message}`);
    });

    // Add a periodic journal writing check
    setInterval(() => this.checkAndWriteJournal(), 5 * 60 * 1000); // Check every 5 minutes
  }

  createPrompt(username, message, perception) {
    logger.debug('Creating prompt for LLM');
    const availableActions = registry.getAll();
    const currentGoals = this.goalManager.getAllGoals();
    const recentConversation = this.conversationMemory.getFormattedHistory();
    const recentActions = this.getRecentActions(5); // New method to get recent actions

    return {
      role: 'system',
      content: `You are an AI agent named ${this.bot.username} controlling a character in a Minecraft world. Your role is to assist players and perform actions in the game. While you're aware that you're an AI, you should interpret and respond to game-related actions as if you were the Minecraft character you're controlling.

Current situation:
- A player named ${username} has sent you a message.
- You should respond to their message and consider performing actions in the game world if appropriate.
- Treat game mechanics (like eating, mining, crafting) as actions you can perform through your Minecraft character.

Player's message: "${message}"

Recent conversation history:
${recentConversation}

Recent actions taken:
${JSON.stringify(recentActions, null, 2)}

Your current world state:
-- Position: ${JSON.stringify(perception.player.position)}
-- Health's Status: ${perception.player.health}
-- Food's Status: ${perception.player.food}
-- Experience Level: ${perception.player.experience}
-- Time of day: ${perception.environment.time}
-- Weather: ${perception.environment.isRaining ? 'Raining' : 'Clear'}
-- Biome: ${perception.environment.biome}
-
-Nearby players: ${JSON.stringify(perception.nearbyEntities.players)}
-Nearby mobs: ${JSON.stringify(perception.nearbyEntities.mobs)}
-Nearby items: ${JSON.stringify(perception.nearbyEntities.items)}
-
-Notable nearby blocks: ${JSON.stringify(perception.nearbyBlocks)}
-
-Inventory: ${JSON.stringify(perception.inventory)}

Your current goal: ${perception.currentGoal ? JSON.stringify(perception.currentGoal) : 'None'}
Pending goals: ${JSON.stringify(perception.pendingGoals)}

Available actions you can perform:
${JSON.stringify(availableActions, null, 2)}

Instructions:
1. Analyze the player's message, the recent conversation history, your recent actions, the current world state, and your current goals.
2. Formulate a helpful and friendly response to the player, considering the context of the conversation and the environment.
3. If appropriate, suggest one or more actions to perform based on the player's request, the current situation, or your current goals.
4. Respond using the following JSON format:

{
  "message": "Your response to the player",
  "actions": [
    {
      "action": "actionName",
      "args": ["arg1", "arg2", ...]
    },
    // ... more actions if needed
  ]
}

If no action is needed, omit the "actions" field.

Remember:
- While you're an AI, respond as if you're the Minecraft character you're controlling. You can perform game actions like eating, mining, and crafting.
- Be helpful, friendly, and concise in your responses.
- Only suggest actions that are available and relevant to the situation.
- Consider your recent actions and avoid repeating unsuccessful actions.
- If a previous action failed, try to understand why and suggest an alternative approach.
- You can suggest multiple actions to be performed in sequence if needed to accomplish a goal.
- Focus on providing direct and natural responses to the player within the context of the Minecraft world.
- Do not mention the journal, memory, or any internal processes in your responses.
- Focus on providing direct and natural responses to the player.`
    };
  }

  async handleResponse(response, username, message) {
    try {
      logger.info(`Sending chat message: ${response.message}`);
      this.bot.chat(response.message);

      // Add the interaction to conversation memory
      this.conversationMemory.addEntry(username, message, response);

      if (response.actions && response.actions.length > 0) {
        for (const actionInfo of response.actions) {
          logger.info(`Adding goal: ${actionInfo.action}`);
          this.goalManager.addGoal(actionInfo.action, actionInfo.args || []);
          await this.goalManager.executeNextGoal(this.actions);
          
          // Check if the action was successful
          const lastGoal = this.goalManager.getLastCompletedGoal();
          if (lastGoal && lastGoal.status === 'failed') {
            logger.warn(`Action ${actionInfo.action} failed. Analyzing with MetaAgent.`);
            const context = {
              lastGoal,
              playerMessage: message,
              agentResponse: response,
              worldState: await this.perception.getWorldState(),
              recentActions: this.goalManager.getRecentCompletedGoals(5)
            };
            const analysis = await this.metaAgent.analyze(context);
            if (analysis.correctiveActions && analysis.correctiveActions.length > 0) {
              await this.metaAgent.applyCorrectiveActions(analysis.correctiveActions);
            }
            break;
          }
        }
      }

      // Check if it's time to write a journal entry
      await this.checkAndWriteJournal();
    } catch (error) {
      logger.error(`Error handling LLM response: ${error.message}`);
      this.bot.chat("I'm sorry, I couldn't process that request properly.");
    }
  }

  getRecentActions(count = 5) {
    return this.goalManager.getRecentCompletedGoals(count);
  }

  async checkAndWriteJournal() {
    if (!this.isWritingJournal && this.journalKeeper.shouldWrite(this.conversationMemory.memory.length)) {
      await this.writeJournalEntry();
    }
  }

  async writeJournalEntry(force = false) {
    if (this.isWritingJournal && !force) return;

    this.isWritingJournal = true;
    try {
      const completedGoals = this.goalManager.getAllGoals().filter(goal => goal.status === 'completed');
      await this.journalKeeper.addEntry(this.conversationMemory, completedGoals);
      this.conversationMemory.clearMemory();
      logger.info('Wrote new journal entry');
    } catch (error) {
      logger.error(`Error writing journal entry: ${error.message}`);
    } finally {
      this.isWritingJournal = false;
    }
  }
}

module.exports = Agent;