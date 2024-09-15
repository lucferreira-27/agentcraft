const logger = require('./logger');

function parse(aiOutput) {
  try {
    logger.debug('AI', 'CommandParser', 'Parsing AI output');
    const parsed = JSON.parse(aiOutput.trim());

    if (parsed.type === 'conversation' && parsed.message) {
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
      
      logger.debug('AI', 'CommandParser', `Parsed action response intent: ${parsed.goal.intent}`);
      return { type: 'action', goal: parsed.goal };
    }

    logger.warn('AI', 'CommandParser', 'Invalid AI response format');
    throw new Error('Invalid AI response format.');
  } catch (error) {
    logger.error('AI', 'CommandParser', 'Error parsing AI response', { error: error.message });
    throw new Error('Failed to parse AI response.');
  }
}

module.exports = { parse };