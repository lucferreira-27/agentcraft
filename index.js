require('dotenv').config();
const Agent = require('./src/agent');
const GoalManager = require('./src/goalManager');
const { logger } = require('./src/utils');

logger.level = 'debug';
logger.info('Starting Minecraft LLM Agent');

const goalManager = new GoalManager();

const agent = new Agent({
  host: process.env.MINECRAFT_HOST,
  port: parseInt(process.env.MINECRAFT_PORT),
  username: process.env.MINECRAFT_USERNAME,
}, process.env.LLM_PROVIDER || 'openrouter', goalManager);

agent.connect();

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message} at ${error.stack}`); // Log the stack trace
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled rejection at ${promise}, reason: ${reason.stack || reason}`); // Log the stack trace or reason
});