const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const BaseProvider = require('./BaseProvider');
const { logger } = require('../utils');
const { registry } = require('../actionRegistry');

class GoogleProvider extends BaseProvider {
  constructor(apiKey) {
    super(apiKey);
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-exp-0827",
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ]
    });
  }

  async getResponse(prompt) {
    try {
      logger.info('Sending request to Google Gemini API');
      const availableActions = registry.getAll();

      const chat = this.model.startChat({
        history: [],
        generationConfig: {
          temperature: 0.7,
          topP: 1,
          topK: 1,
          maxOutputTokens: 2048,
        },
      });

      const result = await chat.sendMessage(prompt.content, {
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
      });

      const response = result.response;
      logger.debug(`Google Gemini API response: ${JSON.stringify(response)}`);

      let parsedResponse;

      if (response.candidates && response.candidates.length > 0) {
        const content = response.candidates[0].content;
        if (content.parts && content.parts.length > 0) {
          const text = content.parts[0].text;
          try {
            // Remove any markdown formatting and parse the JSON
            const jsonString = text.replace(/```json\n|\n```/g, '').trim();
            parsedResponse = JSON.parse(jsonString);
          } catch (error) {
            logger.error(`Error parsing JSON response: ${error.message}`);
            parsedResponse = { message: text };
          }
        } else {
          throw new Error('No content parts in the response');
        }
      } else {
        throw new Error('No candidates in the response');
      }

      return parsedResponse;
    } catch (error) {
      logger.error(`Error getting Google Gemini response: ${error.message}`);
      throw error;
    }
  }
}

module.exports = GoogleProvider;