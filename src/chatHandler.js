const { getAIResponse } = require('./aiClient');
const CommandParser = require('./commandParser');
const GoalManager = require('./goalManager');
const Memory = require('./memory');
const botManager = require('./botManager');
const logger = require('./logger');
const actionRegistry = require('./actionRegistry');

function ensureBotReady() {
  return new Promise((resolve) => {
    const bot = botManager.getBot();
    if (bot && bot.chat && typeof bot.chat === 'function') {
      resolve(bot);
    } else {
      botManager.once('ready', () => resolve(botManager.getBot()));
    }
  });
}

async function handleChat(username, message) {
  const bot = await ensureBotReady();
  try {
    logger.info('ChatHandler', `Received message from ${username}: "${message}"`);
    
    // Record the interaction in memory
    Memory.recordInteraction({ user: username, message, timestamp: Date.now() });
    logger.info('ChatHandler', 'Interaction recorded in memory');

    // Generate prompt for Gemini
    const prompt = generatePrompt(username, message, bot);
    logger.info('ChatHandler', 'Generated prompt for AI');

    // Get AI response
    logger.info('ChatHandler', 'Requesting AI response');
    const aiOutput = await getAIResponse(prompt);
    logger.info('ChatHandler', `Received AI response: ${JSON.stringify(aiOutput)}`);

    // Handle error responses from aiClient
    if (aiOutput.type === 'error') {
      logger.error('ChatHandler', `Error in AI response: ${aiOutput.message}`);
      logger.info('ChatHandler', `Raw AI response: ${aiOutput.rawResponse}`);
      throw new Error('Invalid AI response format');
    }

    // Parse AI response
    logger.info('ChatHandler', 'Parsing AI response');
    const parsedResponse = CommandParser.parse(aiOutput);
    logger.info('ChatHandler', `Parsed response type: ${parsedResponse.type}`);
    
    // Handle conversational responses
    if (parsedResponse.type === 'conversation') {
      logger.info('ChatHandler', `Sending conversational response: "${parsedResponse.message}"`);
      bot.chat(parsedResponse.message);
    }

    // Handle action plans
    else if (parsedResponse.type === 'action') {
      logger.info('ChatHandler', `Adding new goal: ${parsedResponse.goal.intent}`);
      logger.info('ChatHandler', `Goal details: ${JSON.stringify(parsedResponse.goal, null, 2)}`);
      GoalManager.addGoal(parsedResponse.goal);
      bot.chat(`Understood, ${username}. I will ${parsedResponse.goal.intent}.`);
    }

    else {
      throw new Error(`Unknown response type: ${parsedResponse.type}`);
    }

  } catch (error) {
    logger.error('ChatHandler', `Error handling chat: ${error.message}`);
    logger.info('ChatHandler', `Error stack: ${error.stack}`);
    bot.chat(`Sorry, ${username}, I couldn't process your request due to a ${error.name}. Please try rephrasing your message.`);
  }
}

function generatePrompt(username, message, bot) {
  const recentInteractions = Memory.getRecentInteractions(5)
    .map(interaction => `Player (${interaction.user}): "${interaction.message}"`)
    .join('\n');

  const currentState = `
    Agent State:
    - Position: (${bot.entity.position.x.toFixed(2)}, ${bot.entity.position.y.toFixed(2)}, ${bot.entity.position.z.toFixed(2)})
    - Health: ${bot.health}
    - Inventory: [${bot.inventory.items().map(item => item.name).join(', ')}]
    - Time: ${bot.time}
    - Recent Interactions:
    ${recentInteractions}
  `;

  const availableActions = Object.keys(actionRegistry).map(action => {
    const params = actionRegistry[action].toString()
      .match(/\(.*?\)/)[0]
      .replace(/[()]/g, '')
      .split(',')
      .map(param => param.trim());
    if (action === 'followPlayer') {
      params.push('stopAtPlayerPosition: boolean');
      params.push('duration: number');
    }
    // Add 'stop' option for actions that can be stopped
    const stoppableActions = ['followPlayer', 'moveTo', 'collectBlock', 'buildStructure', 'attackEntity'];
    if (stoppableActions.includes(action)) {
      params.push('stop: boolean');
    }
    return `${action}: { ${params.join(', ')} }`;
  }).join('\n');

  return `
    You are an AI companion in a Minecraft game, assisting the player by understanding and responding to their messages.

    ${currentState}

    Available Actions:
    ${availableActions}

    Player (${username}): "${message}"

    Respond appropriately, either by engaging in conversation or by generating an action plan to assist the player. Use only the available actions listed above when creating action plans. You can include a 'stop: true' parameter to stop an ongoing action of the same type.

    When asked to collect any type of block or material (e.g., wood, dirt, stone, sand), use the collectBlock action with the general term as the blockType. The system will automatically map these to specific Minecraft block types. For example:
    - 'wood' will collect any type of log
    - 'dirt' will collect dirt, grass blocks, or podzol
    - 'stone' will collect stone, cobblestone, granite, diorite, or andesite

    If a specific block type is mentioned, use that exact name (e.g., 'oak_log', 'cobblestone').

    Use the following JSON schema for your response:

    Response = {
      'type': 'conversation' | 'action',
      'message': string,  // Required for 'conversation' type
      'goal': {  // Required for 'action' type
        'intent': string,
        'priority': number,
        'actions': [
          {
            'type': string,
            'parameters': {
              [key: string]: string | number | boolean | string[] | object,
              stop?: boolean  // Include this to stop an ongoing action
            }
          }
        ]
      }
    }

    Ensure that your response is a valid JSON object matching this schema. Do not include any text outside of the JSON object.
  `;
}

module.exports = { handleChat };