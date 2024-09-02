const { logger } = require('./utils');
const OpenAIProvider = require('./providers/OpenAIProvider');
const ClaudeProvider = require('./providers/ClaudeProvider');
const GoogleProvider = require('./providers/GoogleProvider');
const OpenRouterProvider = require('./providers/OpenRouterProvider');

class LLM {
  constructor(providerName) {
    this.provider = this.getProvider(providerName);
    logger.info(`LLM instance created with ${providerName} provider`);
  }

  getProvider(providerName) {
    switch (providerName.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(process.env.OPENAI_API_KEY);
      case 'claude':
        return new ClaudeProvider(process.env.CLAUDE_API_KEY);
      case 'google':
        return new GoogleProvider(process.env.GOOGLE_API_KEY);
      case 'openrouter':
        return new OpenRouterProvider(process.env.OPENROUTER_API_KEY);
      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }
  }

  async getResponse(prompt) {
    try {
      return await this.provider.getResponse(prompt);
    } catch (error) {
      logger.error(`Error getting LLM response: ${error.message}`);
      return { message: "I'm sorry, I encountered an error while processing your request." };
    }
  }
}

module.exports = LLM;