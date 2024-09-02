const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const { logger } = require('../utils');

class OpenAIProvider extends BaseProvider {
  async getResponse(prompt) {
    try {
      logger.info('Sending request to OpenAI API');
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
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

      logger.debug(`OpenAI API response: ${JSON.stringify(response.data)}`);
      return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
      logger.error(`Error getting OpenAI response: ${error.message}`);
      throw error;
    }
  }
}

module.exports = OpenAIProvider;