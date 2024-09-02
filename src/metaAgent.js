const LLM = require('./llm');
const { logger } = require('./utils');

class MetaAgent {
  constructor(agent, llmProvider) {
    this.agent = agent;
    this.llm = new LLM(llmProvider);
  }

  async analyze(context) {
    const prompt = this.createAnalysisPrompt(context);
    const response = await this.llm.getResponse(prompt);
    return this.processAnalysisResponse(response);
  }

  createAnalysisPrompt(context) {
    return {
      role: 'system',
      content: `You are a MetaAgent overseeing an AI agent in a Minecraft world. Your job is to analyze the agent's actions, detect errors, and provide guidance. 

Context:
${JSON.stringify(context, null, 2)}

Analyze the agent's behavior and respond with:
1. An assessment of the agent's performance
2. Identification of any errors or suboptimal behaviors
3. Suggestions for improvement
4. Corrective actions if necessary

Respond in the following JSON format:
{
  "assessment": "Your assessment of the agent's performance",
  "errors": ["List of identified errors"],
  "suggestions": ["List of suggestions for improvement"],
  "correctiveActions": [
    {
      "action": "actionName",
      "args": ["arg1", "arg2"]
    }
  ]
}
`
    };
  }

  processAnalysisResponse(response) {
    if (response.errors && response.errors.length > 0) {
      logger.warn(`MetaAgent detected errors: ${response.errors.join(', ')}`);
    }
    if (response.suggestions && response.suggestions.length > 0) {
      logger.info(`MetaAgent suggestions: ${response.suggestions.join(', ')}`);
    }
    return response;
  }

  async applyCorrectiveActions(correctiveActions) {
    for (const action of correctiveActions) {
      try {
        await this.agent.actions.executeAction(action.action, action.args);
      } catch (error) {
        logger.error(`Error executing corrective action ${action.action}: ${error.message}`);
      }
    }
  }
}

module.exports = MetaAgent;