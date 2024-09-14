const { getAIResponse } = require('./aiClient');
const CommandParser = require('./commandParser');
const { GoalManager, GoalAddOutcome } = require('./goals/goalManager');
const Memory = require('./memory');
const botManager = require('./botManager');
const logger = require('./logger');
const actionRegistry = require('./actions/actionRegistry.js');
const { parameterSchemas } = require('./actions/actionUtils');

let goalManager;

function ensureBotReady() {
  return new Promise((resolve) => {
    const bot = botManager.getBot();
    if (bot && bot.chat && typeof bot.chat === 'function') {
      if (!goalManager) {
        goalManager = new GoalManager(bot);
      }
      resolve(bot);
    } else {
      botManager.once('ready', () => {
        const readyBot = botManager.getBot();
        if (!goalManager) {
          goalManager = new GoalManager(readyBot);
        }
        resolve(readyBot);
      });
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
      const result = goalManager.addGoal(parsedResponse.goal);
      
      switch (result.outcome) {
        case GoalAddOutcome.ADDED:
          bot.chat(`Understood, ${username}. I will ${result.goal.intent}.`);
          break;
        case GoalAddOutcome.UPDATED:
          bot.chat(`I've updated my existing task to ${result.goal.intent}, ${username}.`);
          break;
        case GoalAddOutcome.IGNORED_COOLDOWN:
          bot.chat(`I've recently performed a similar task, ${username}. Please wait a moment before asking again.`);
          break;
        case GoalAddOutcome.IGNORED_ONGOING:
          bot.chat(`I'm already working on ${result.goal.intent}, ${username}. I'll continue with that.`);
          break;
        case GoalAddOutcome.STOPPED_EXISTING:
          bot.chat(`I've stopped my current ${result.goal.intent} task as requested, ${username}.`);
          break;
        default:
          bot.chat(`I've processed your request, ${username}, but I'm not sure how to respond.`);
      }
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

  const currentGoals = goalManager.getCurrentGoals();
  const currentGoalsString = currentGoals.length > 0
    ? currentGoals.map(goal => `- ${goal.intent} (ID: ${goal.id}, Status: ${goal.status})`).join('\n')
    : 'No current goals';

  const currentState = `
    Agent State:
    - Position: (${bot.entity.position.x.toFixed(2)}, ${bot.entity.position.y.toFixed(2)}, ${bot.entity.position.z.toFixed(2)})
    - Health: ${bot.health}
    - Inventory: [${bot.inventory.items().map(item => item.name).join(', ')}]
    - Time: ${bot.time}
    - Current Goals:
    ${currentGoalsString}
    - Recent Interactions:
    ${recentInteractions}
  `;

  const availableActions = Array.from(actionRegistry.actions.keys()).map(action => {
    const schema = parameterSchemas[action];
    if (!schema) {
      return `  ${action}:\n    Parameters: Unknown`;
    }

    const formattedParams = Object.keys(schema.describe().keys).map(key => {
      const param = schema.describe().keys[key];
      let paramString = `${key}: ${param.type}`;
      if (param.flags && param.flags.presence === 'required') {
        paramString += ' (required)';
      }
      if (param.valids && param.valids.length > 0) {
        paramString += ` (${param.valids.join('|')})`;
      }
      return paramString;
    });

    // Add 'stop' option for actions that can be stopped
    const stoppableActions = ['followPlayer', 'collectBlock', 'attackEntity'];
    if (stoppableActions.includes(action)) {
      formattedParams.push('stop: boolean');
    }

    return `  ${action}:\n    Parameters: ${formattedParams.join(', ')}`;
  }).join('\n\n');

  logger.info('ChatHandler', `Available actions: ${availableActions}`);

  return `
    You are an AI companion in a Minecraft game, assisting the player by understanding and responding to their messages. Your responses MUST be either conversational or action-based, depending on the player's request. You now have the ability to view and cancel ongoing goals.

    Current game state:
    ${currentState}

    Available actions:
    ${availableActions}

    Recent chat history:
    ${recentInteractions}

    Player (${username}): "${message}"

    RESPONSE GUIDELINES:
    1. Use 'conversation' type for:
       - General chat or information
       - Answering questions
       - When no specific action is needed or possible
    2. Use 'action' type for:
       - Specific tasks requested by the player
       - Actions clearly implied by the player's message
       - Stopping ongoing actions
    3. ONLY use actions listed in the available actions. DO NOT invent new ones.
    4. To stop an ongoing action, use the 'action' type with the 'stop' parameter set to true.
    5. To cancel an ongoing goal, use the 'action' type with a 'cancelGoal' action.

    IMPORTANT ACTION NOTES:
    - collectBlock: Use general terms (wood, dirt, stone) unless a specific block is mentioned.
    - followPlayer: Parameters: username, stopAtPlayerPosition, durationInMs

    RESPONSE SCHEMA:
    {
      'type': 'conversation' | 'action',
      'message': string,  // Required for 'conversation' type
      'goal': {  // Required for 'action' type
        'intent': string,
        'priority': number,
        'actions': [
          {
            'type': string,
            'parameters': {
              [key: string]: any,
              stop?: boolean  // Use to stop an ongoing action
            }
          }
        ]
      }
    }

    For canceling a goal:
    {
      'type': 'action',
      'goal': {
        'intent': 'Cancel specific goal',
        'priority': 1,
        'actions': [
          {
            'type': 'cancelGoal',
            'parameters': {
              'goalId': string  // The ID of the goal to cancel
            }
          }
        ]
      }
    }

    EXAMPLES:

    1. Simple conversation:
    {
      'type': 'conversation',
      'message': 'Diamonds are typically found between layers 5 and 12 in Minecraft. Happy mining!'
    }

    2. Answering a question:
    {
      'type': 'conversation',
      'message': 'Yes, you can tame wolves in Minecraft using bones. Once tamed, they'll become loyal companions and help you in battles.'
    }

    3. Simple action (collecting wood):
    {
      'type': 'action',
      'goal': {
        'intent': 'Collect 5 wood blocks',
        'priority': 2,
        'actions': [
          {
            'type': 'collectBlock',
            'parameters': {
              'blockType': 'wood',
              'quantity': 5
            }
          }
        ]
      }
    }

    4. Complex action (following player then mining):
    {
      'type': 'action',
      'goal': {
        'intent': 'Follow player for 1 minute then collect stone',
        'priority': 3,
        'actions': [
          {
            'type': 'followPlayer',
            'parameters': {
              'username': '${username}',
              'durationInMs': 60000
            }
          },
          {
            'type': 'collectBlock',
            'parameters': {
              'blockType': 'stone',
              'quantity': 10
            }
          }
        ]
      }
    }

    5. Stopping an action:
    {
      'type': 'action',
      'goal': {
        'intent': 'Stop following player',
        'priority': 1,
        'actions': [
          {
            'type': 'followPlayer',
            'parameters': {
              'stop': true
            }
          }
        ]
      }
    }

    6. Handling a complex request:
    {
      'type': 'action',
      'goal': {
        'intent': 'Gather resources for crafting',
        'priority': 4,
        'actions': [
          {
            'type': 'collectBlock',
            'parameters': {
              'blockType': 'wood',
              'quantity': 8
            }
          },
          {
            'type': 'collectBlock',
            'parameters': {
              'blockType': 'stone',
              'quantity': 8
            }
          }
        ]
      }
    }

    7. Canceling a goal:
    {
      'type': 'action',
      'goal': {
        'intent': 'Cancel specific goal',
        'priority': 1,
        'actions': [
          {
            'type': 'cancelGoal',
            'parameters': {
              'goalId': '1234-5678-90ab-cdef'  // Example goal ID
            }
          }
        ]
      }
    }



    REMEMBER:
    - Always respond with a valid JSON object matching the schema.
    - Do not include any text outside of the JSON object.
    - Use the correct response type based on the player's request.
    - Only use available actions for 'action' type responses.
  `;
}

module.exports = { handleChat };