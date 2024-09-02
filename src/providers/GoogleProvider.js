const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const { logger } = require('../utils');
const { registry } = require('../actionRegistry');

class GoogleProvider extends BaseProvider {
  constructor(apiKey) {
    super(apiKey);
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.model = 'gemini-1.5-flash';
  }

  async getResponse(prompt) {
    try {
      logger.info('Sending request to Google Gemini API');
      const availableActions = registry.getAll();
      const response = await axios.post(
        `${this.baseUrl}/${this.model}:generateContent`,
        {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt.content }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 1,
            topK: 1,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            {
              category: 'HARM_CATEGORY_DANGEROUS',
              threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            }
          ],
          tools: [{
            functionDeclarations: availableActions.map(action => ({
              name: action.name,
              description: action.description,
              parameters: {
                type: 'object',
                properties: action.parameters.reduce((acc, param) => {
                  acc[param.name] = {
                    type: param.type,
                    description: param.description
                  };
                  return acc;
                }, {}),
                required: action.parameters.filter(param => !param.default).map(param => param.name)
              }
            }))
          }]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.debug(`Google Gemini API response: ${JSON.stringify(response.data)}`);
      
      const content = response.data.candidates[0].content;
      let parsedResponse;

      if (content.parts[0].functionCall) {
        const functionCall = content.parts[0].functionCall;
        parsedResponse = {
          message: content.parts[0].text || "I'm performing an action.",
          action: functionCall.name,
          args: Object.values(functionCall.args)
        };
      } else {
        parsedResponse = JSON.parse(content.parts[0].text);
      }

      return parsedResponse;
    } catch (error) {
      logger.error(`Error getting Google Gemini response: ${error.message}`);
      throw error;
    }
  }
}

module.exports = GoogleProvider;