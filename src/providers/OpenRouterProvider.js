const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const { logger } = require('../utils');

class OpenRouterProvider extends BaseProvider {
  async getResponse(prompt) {
    try {
      logger.info('Sending request to OpenRouter API');
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'google/gemini-flash-1.5',
          messages: [
            { role: 'system', content: 'You are a JSON-only output assistant. Always respond with valid JSON.' },
            prompt
          ],
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.debug(`OpenRouter API response: ${JSON.stringify(response.data)}`);
      return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
      logger.error(`Error getting OpenRouter response: ${error.message}`);
      throw error;
    }
  }
}

module.exports = OpenRouterProvider;