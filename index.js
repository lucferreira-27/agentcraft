require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const Agent = require('./src/agent');
const { logger } = require('./src/utils');

logger.level = process.env.LOG_LEVEL || 'info';

async function ensureDataDirectory() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    logger.error(`Error creating data directory: ${error.message}`);
  }
}

async function main() {
  await ensureDataDirectory();

  logger.level = process.env.LOG_LEVEL || 'info';
  logger.info('Starting Minecraft LLM Agent');

  const agent = new Agent({
    host: process.env.MINECRAFT_HOST,
    port: parseInt(process.env.MINECRAFT_PORT),
    username: process.env.MINECRAFT_USERNAME,
  }, process.env.LLM_PROVIDER || 'openrouter');

  await agent.connect();

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Gracefully shutting down...');
    await agent.writeJournalEntry(true);
    process.exit(0);
  });
}

main().catch(error => {
  logger.error(`Error in main: ${error.message}`);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled rejection at ${promise}, reason: ${reason}`);
});