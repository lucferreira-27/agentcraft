const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } = require('@google/generative-ai');
const logger = require('./logger');

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure the model with safety settings disabled and JSON response enabled
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
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

async function getAIResponse(prompt) {
  try {
    logger.info('AIClient', `Sending prompt to Gemini API: ${prompt.substring(0, 100)}...`);
    const startTime = Date.now();
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }]}],
    });

    const response = result.response;
    const endTime = Date.now();
    logger.info('AIClient', `Gemini API response time: ${endTime - startTime}ms`);
    
    // The response is already a JSON object, no need to parse
    const jsonResponse =  response.candidates[0].content.parts[0].text;
    logger.info('AIClient', `Received JSON response from Gemini API: ${JSON.stringify(jsonResponse).substring(0, 100)}...`);
    
    return jsonResponse;
  } catch (error) {
    logger.error('AIClient', `Error communicating with Gemini API: ${error.message}`);
    throw new Error('AI response failed.');
  }
}

module.exports = { getAIResponse };