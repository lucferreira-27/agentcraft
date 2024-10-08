const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const logger = require('./logger');

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure the model with safety settings disabled and JSON response enabled
const model = genAI.getGenerativeModel({ 
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
  ],
  generationConfig: {
    temperature: 0.9,
    topK: 1,
    topP: 1,
    maxOutputTokens: 2048,
    responseMimeType: 'application/json',
  },
});

async function getAIResponse(prompt, context = {}) {
  try {
    logger.debug('AI', 'AIClient', 'Sending prompt to Gemini API', { promptPreview: prompt.substring(0, 100) });
    const startTime = Date.now();
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }]}],
    });

    const response = result.response;
    const endTime = Date.now();
    logger.info('AI', 'AIClient', `Gemini API response time: ${endTime - startTime}m | Token count: ${result.response.usageMetadata?.totalTokenCount}`);
    
    const jsonResponse = response.candidates[0].content.parts[0].text;
    logger.debug('AI', 'AIClient', 'Received JSON response from Gemini API', { responsePreview: jsonResponse });
    
    return jsonResponse;
  } catch (error) {
    logger.error('AI', 'AIClient', 'Error communicating with Gemini API', { error: error.message });
    throw new Error('AI response failed.');
  }
}

async function handleActionError(goal, action, error) {
  const context = {
    goal: goal.intent,
    failedAction: action.type,
    error: error.message,
    availableActions: Object.keys(require('./actions/actionRegistry'))
  };

  const prompt = `
The bot encountered an error while executing an action. Please provide an alternative action or suggest skipping this action.

Current goal: ${goal.intent}
Failed action: ${action.type}
Error: ${error.message}

Available actions:
${context.availableActions.join(', ')}

Please respond with a JSON object containing either an alternative action or a decision to skip:
{
  "decision": "retry" | "skip",
  "alternativeAction": {
    "type": string,
    "parameters": object
  }
}
`;

  try {
    logger.info('AI', 'AIClient', 'Requesting alternative action for failed action', { goal: goal.intent, failedAction: action.type });
    const response = await getAIResponse(prompt, context);
    const parsedResponse = JSON.parse(response);

    if (parsedResponse.decision === 'retry' && parsedResponse.alternativeAction) {
      logger.info('AI', 'AIClient', 'Received alternative action', { alternativeAction: parsedResponse.alternativeAction });
      return parsedResponse.alternativeAction;
    } else {
      logger.info('AI', 'AIClient', 'Decision to skip action');
      return null; // Skip the action
    }
  } catch (error) {
    logger.error('AI', 'AIClient', 'Error handling action error', { error: error.message });
    return null; // Skip the action if we can't get a valid response
  }
}

module.exports = { getAIResponse, handleActionError };