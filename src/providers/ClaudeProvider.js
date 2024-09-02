const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const { logger } = require('../utils');

class ClaudeProvider extends BaseProvider {
  async getResponse(prompt) {
    try {
      logger.info('Sending request to Claude API');
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-2',
          messages: [
            { role: 'system', content: 'You are a JSON-only output assistant. Always respond with valid JSON.' },
            prompt
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.debug(`Claude API response: ${JSON.stringify(response.data)}`);
      return JSON.parse(response.data.content[0].text);
    } catch (error) {
      logger.error(`Error getting Claude response: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ClaudeProvider;