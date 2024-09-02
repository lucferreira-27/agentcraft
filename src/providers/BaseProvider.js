class BaseProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async getResponse(prompt) {
    throw new Error('getResponse method must be implemented by subclasses');
  }
}

module.exports = BaseProvider;