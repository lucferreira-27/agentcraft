const logger = require('./logger');

function parse(aiOutput) {
  try {
    logger.info('CommandParser', `Parsing AI output: ${aiOutput}`);
    const parsed = JSON.parse(aiOutput.trim());

    if (parsed.type === 'conversation' && parsed.message) {
      logger.info('CommandParser', 'Parsed conversation response');
      return { type: 'conversation', message: parsed.message };
    }

    if (parsed.type === 'action' && parsed.goal && parsed.goal.intent && Array.isArray(parsed.goal.actions)) {
      // Validate priority
      parsed.goal.priority = parsed.goal.priority || 1; // Default priority
      
      // Handle 'stop' parameter
      parsed.goal.actions = parsed.goal.actions.map(action => {
        if (action.parameters && action.parameters.stop === true) {
          return { ...action, stop: true };
        }
        return action;
      });
      
      logger.info('CommandParser', `Parsed action response with intent: ${parsed.goal.intent}`);
      return { type: 'action', goal: parsed.goal };
    }

    logger.warn('CommandParser', 'Invalid AI response format');
    throw new Error('Invalid AI response format.');
  } catch (error) {
    logger.error('CommandParser', `Error parsing AI response: ${error.message}`);
    throw new Error('Failed to parse AI response.');
  }
}

module.exports = { parse };