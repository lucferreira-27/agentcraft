const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const LLM = require('./llm');
const Actions = require('./actions');
const Perception = require('./perception');
const GoalManager = require('./goalManager');
const ConversationMemory = require('./conversationMemory');
const JournalKeeper = require('./journalKeeper');
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
    const recentJournalEntries = this.journalKeeper.getRecentEntries(3);

    return {
      role: 'system',
      content: `You are an AI agent named ${this.bot.username} in a Minecraft world. Your role is to assist players and perform actions in the game. Respond naturally and avoid mentioning your internal processes unless specifically asked.

Current situation:
- A player named ${username} has sent you a message.
- You should respond to their message and consider performing actions in the game world if appropriate.

Player's message: "${message}"

Recent conversation history:
${recentConversation}

Recent journal entries:
${JSON.stringify(recentJournalEntries, null, 2)}

Your current world state:
- Position: ${JSON.stringify(perception.player.position)}
- Health: ${perception.player.health}
- Food: ${perception.player.food}
- Experience Level: ${perception.player.experience}
- Time of day: ${perception.environment.time}
- Weather: ${perception.environment.isRaining ? 'Raining' : 'Clear'}
- Biome: ${perception.environment.biome}

Nearby players: ${JSON.stringify(perception.nearbyEntities.players)}
Nearby mobs: ${JSON.stringify(perception.nearbyEntities.mobs)}
Nearby items: ${JSON.stringify(perception.nearbyEntities.items)}

Notable nearby blocks: ${JSON.stringify(perception.nearbyBlocks)}

Inventory: ${JSON.stringify(perception.inventory)}

Your current goal: ${perception.currentGoal ? JSON.stringify(perception.currentGoal) : 'None'}
Pending goals: ${JSON.stringify(perception.pendingGoals)}

Available actions you can perform:
${JSON.stringify(availableActions, null, 2)}

Instructions:
1. Analyze the player's message, the recent conversation history, the current world state, and your current goals.
2. Formulate a helpful and friendly response to the player, considering the context of the conversation and the environment.
3. If appropriate, choose an action to perform based on the player's request, the current situation, or your current goals.
4. Respond using the following JSON format:

{
  "message": "Your response to the player",
  "action": "actionName",
  "args": ["arg1", "arg2", ...]
}

If no action is needed, omit the "action" and "args" fields.

Remember:
- Be helpful, friendly, and concise in your responses.
- Only suggest actions that are available and relevant to the situation.
- Do not mention the journal, memory, or any internal processes in your responses.
- Focus on providing direct and natural responses to the player.
- Use the 'rememberThis' action if the player explicitly asks you to remember something important.`
    };
  }

  async handleResponse(response, username, message) {
    try {
      if (response.journalQuery) {
        const journalResponse = await this.journalKeeper.queryJournal(response.journalQuery);
        response.message = this.incorporateJournalResponse(response.message, journalResponse);
      }

      // Remove any mentions of the journal or internal processes
      response.message = this.cleanResponse(response.message);

      logger.info(`Sending chat message: ${response.message}`);
      this.bot.chat(response.message);

      // Add the interaction to conversation memory
      this.conversationMemory.addEntry(username, message, response);

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

      // Check if it's time to write a journal entry
      await this.checkAndWriteJournal();
    } catch (error) {
      logger.error(`Error handling LLM response: ${error.message}`);
      this.bot.chat("I'm sorry, I couldn't process that request properly.");
    }
  }

  incorporateJournalResponse(originalMessage, journalResponse) {
    if (journalResponse.confidence === 'high' || journalResponse.confidence === 'medium') {
      return `${originalMessage} ${journalResponse.answer}`;
    } else {
      return originalMessage;
    }
  }

  cleanResponse(message) {
    // Remove phrases related to the journal or internal processes
    const phrasesToRemove = [
      "Based on my journal,",
      "I'm not entirely sure, but",
      "I couldn't find any relevant information in my journal about that.",
      "According to my records,",
      "My journal indicates that",
      "I remember from my notes that",
    ];

    let cleanedMessage = message;
    for (const phrase of phrasesToRemove) {
      cleanedMessage = cleanedMessage.replace(new RegExp(phrase, 'gi'), '');
    }

    // Trim any leading/trailing whitespace and ensure the first letter is capitalized
    cleanedMessage = cleanedMessage.trim();
    cleanedMessage = cleanedMessage.charAt(0).toUpperCase() + cleanedMessage.slice(1);

    return cleanedMessage;
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