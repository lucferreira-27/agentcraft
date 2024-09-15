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
    logger.info('CHAT', 'ChatHandler', `Received message from ${username}: "${message}"`);
    
    Memory.recordInteraction({ user: username, message, timestamp: Date.now() });
    logger.debug('CHAT', 'ChatHandler', 'Interaction recorded in memory');

    const prompt = generatePrompt(username, message, bot);
    logger.debug('AI', 'ChatHandler', 'Generated prompt for AI');

    logger.info('AI', 'ChatHandler', 'Requesting AI response');
    const aiOutput = await getAIResponse(prompt);
    if (aiOutput.type === 'error') {
      logger.error('AI', 'ChatHandler', 'Error in AI response', { error: aiOutput });
      throw new Error('Invalid AI response format');
    }

    logger.debug('CHAT', 'ChatHandler', 'Parsing AI response');
    const parsedResponse = CommandParser.parse(aiOutput);
    logger.debug('CHAT', 'ChatHandler', `Parsed response type: ${parsedResponse.type}`);
    
    if (parsedResponse.type === 'conversation') {
      logger.info('CHAT', 'ChatHandler', `Sending conversational response: "${parsedResponse.message}"`);
      bot.chat(parsedResponse.message);
    } else if (parsedResponse.type === 'action') {
      logger.info('GOAL', 'ChatHandler', `Adding new goal: ${parsedResponse.goal.intent}`);
      const result = goalManager.addGoal(parsedResponse.goal);
      
      let responseMessage = '';
      for (const action of parsedResponse.goal.actions) {
        switch (action.type) {
          case 'pauseGoal':
            responseMessage += `I've paused the current task. `;
            break;
          case 'resumeGoal':
            responseMessage += `I'll resume the paused task after completing the current one. `;
            break;
          case 'destroyGoal':
            responseMessage += `I've stopped the specified task. `;
            break;
          case 'collectBlock':
            responseMessage += `I'll collect ${action.parameters.quantity} ${action.parameters.blockType}. `;
            break;
          // Add cases for other action types as needed
          default:
            responseMessage += `I'll perform a ${action.type} action. `;
        }
      }

      bot.chat(`Understood, ${username}. ${responseMessage}`);
    } else {
      throw new Error(`Unknown response type: ${parsedResponse.type}`);
    }

  } catch (error) {
    logger.error('CHAT', 'ChatHandler', 'Error handling chat', { error: error.message, stack: error.stack });
    bot.chat(`Sorry, ${username}, I couldn't process your request due to an error. Please try rephrasing your message.`);
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
  logger.debug('CHAT', 'ChatHandler', 'Current goals', { currentGoalsString });

  const currentState = `
    Agent State:
    - Position: (${bot.entity.position.x.toFixed(2)}, ${bot.entity.position.y.toFixed(2)}, ${bot.entity.position.z.toFixed(2)})
    - Health: ${bot.health}
    - Inventory: [${bot.inventory.items().map(item => item.name).join(', ')}]
    - Time: ${bot.time}
    - Current Goals:
    ${currentGoalsString}
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

    return `  ${action}:\n    Parameters: ${formattedParams.join(', ')}`;
  }).join('\n\n');

  logger.debug('AI', 'ChatHandler', 'Available actions', { availableActions });

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
    4. To stop or pause an ongoing goal, use the 'destroyGoal' or 'pauseGoal' action with the goal's ID.
    5. Use 'resumeGoal' to continue a paused goal.

    IMPORTANT ACTION NOTES:
    - collectBlock: Use general terms (wood, dirt, stone) unless a specific block is mentioned.
    - followPlayer: Parameters: username, stopAtPlayerPosition, durationInMs

    IMPORTANT: Goal Management Actions have the highest priority:
    1. 'destroyGoal' has the absolute highest priority and will be executed immediately.
    2. 'pauseGoal' and 'resumeGoal' have the second highest priority and will be executed immediately after any 'destroyGoal' actions.
    3. These actions will interrupt and take precedence over any ongoing or queued goals.

    When using these high-priority actions:
    - Use 'destroyGoal' to immediately and permanently stop a goal.
    - Use 'pauseGoal' to temporarily halt a goal that you intend to resume later.
    - Use 'resumeGoal' to continue a previously paused goal.

    Example of using a high-priority action:
    {
      'type': 'action',
      'goal': {
        'intent': 'Immediately stop current goal',
        'priority': 10,  // High priority number
        'actions': [
          {
            'type': 'destroyGoal',
            'parameters': {
              'goalId': '1234-5678-90ab-cdef'  // ID of the goal to stop
            }
          }
        ]
      }
    }

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
            'type': 'destroyGoal',
            'parameters': {
              'goalId': string  // The ID of the goal to cancel
            }
          }
        ]
      }
    }

    New Goal Management Actions:
    - Use 'pauseGoal' to temporarily interrupt a goal. The bot will resume this goal when other goals are completed.
    - Use 'resumeGoal' to manually resume a paused goal.
    - Use 'destroyGoal' to permanently remove a goal (replaces 'cancelGoal').

    When deciding between pausing and destroying a goal:
    - Pause when the interrupted task is likely to be resumed later (e.g., pausing 'follow player' to quickly gather resources).
    - Destroy when the goal is no longer relevant or conflicts with new priorities.

    Example for pausing a goal:
    {
      'type': 'action',
      'goal': {
        'intent': 'Pause following to collect wood',
        'priority': 1,
        'actions': [
          {
            'type': 'pauseGoal',
            'parameters': {
              'goalId': '1234-5678-90ab-cdef'  // ID of the 'follow player' goal
            }
          },
          {
            'type': 'collectBlock',
            'parameters': {
              'blockType': 'wood',
              'quantity': 5
            }
          },
          {
            'type': 'resumeGoal',
            'parameters': {
              'goalId': '1234-5678-90ab-cdef'  // ID of the 'follow player' goal
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

    5. Stopping a goal:
    {
      'type': 'action',
      'goal': {
        'intent': 'Stop current goal',
        'priority': 10,  // High priority number
        'actions': [
          {
            'type': 'destroyGoal',
            'parameters': {
              'goalId': '1234-5678-90ab-cdef'  // ID of the goal to stop
            }
          }
        ]
      }
    }

    6. Pausing a goal:
    {
      'type': 'action',
      'goal': {
        'intent': 'Pause current goal',
        'priority': 9,  // Second highest priority number
        'actions': [
          {
            'type': 'pauseGoal',
            'parameters': {
              'goalId': '1234-5678-90ab-cdef'  // ID of the goal to pause
            }
          }
        ]
      }
    }

    7. Handling a complex request:
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

    8. Canceling a goal:
    {
      'type': 'action',
      'goal': {
        'intent': 'Cancel specific goal',
        'priority': 10,  // High priority number
        'actions': [
          {
            'type': 'destroyGoal',
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