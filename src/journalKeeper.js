const fs = require('fs').promises;
const path = require('path');
const { logger } = require('./utils');
const LLM = require('./llm');

class JournalKeeper {
  constructor(agentName, journalPath, llmProvider) {
    this.agentName = agentName;
    this.journalPath = journalPath;
    this.llm = new LLM(llmProvider);
    this.entries = [];
    this.lastWriteTime = Date.now();
    this.writeInterval = 30 * 60 * 1000; // 30 minutes
    this.memoryThreshold = 50; // Number of conversations before writing
  }

  async loadJournal() {
    try {
      const data = await fs.readFile(this.journalPath, 'utf8');
      this.entries = JSON.parse(data);
      logger.info(`Loaded ${this.entries.length} journal entries`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No existing journal found. Starting a new one.');
      } else {
        logger.error(`Error loading journal: ${error.message}`);
      }
    }
  }

  async saveJournal() {
    try {
      await fs.writeFile(this.journalPath, JSON.stringify(this.entries, null, 2));
      logger.info(`Saved ${this.entries.length} journal entries`);
    } catch (error) {
      logger.error(`Error saving journal: ${error.message}`);
    }
  }

  async addEntry(conversationMemory, completedGoals) {
    const prompt = this.createJournalPrompt(conversationMemory, completedGoals);
    const response = await this.llm.getResponse(prompt);

    if (response.journalEntry) {
      this.entries.push({
        timestamp: new Date().toISOString(),
        entry: response.journalEntry
      });
      await this.saveJournal();
      this.lastWriteTime = Date.now();
    } else {
      logger.error('Failed to generate journal entry');
    }
  }

  async addCustomEntry(information) {
    const entry = {
      timestamp: new Date().toISOString(),
      entry: `I was asked to remember: ${information}`
    };
    this.entries.push(entry);
    await this.saveJournal();
    this.lastWriteTime = Date.now();
    logger.info('Added custom journal entry');
  }

  createJournalPrompt(conversationMemory, completedGoals) {
    return {
      role: 'system',
      content: `You are ${this.agentName}, an AI agent in a Minecraft world. Write a journal entry summarizing your recent experiences, interactions, and completed goals. Use a friendly, introspective tone as if you were writing in your personal diary. Include your thoughts and feelings about the events.

Recent conversations:
${conversationMemory.getFormattedHistory()}

Completed goals:
${JSON.stringify(completedGoals, null, 2)}

Write a journal entry of about 150-200 words. Respond in the following JSON format:

{
  "journalEntry": "Your journal entry here"
}
`
    };
  }

  getRecentEntries(count = 5) {
    return this.entries.slice(-count);
  }

  async queryJournal(question) {
    const prompt = {
      role: 'system',
      content: `You are an AI assistant helping to search and summarize journal entries. Given the following journal entries and a question, provide a relevant summary or answer. If the information is not available in the entries, state that clearly.

Journal entries:
${JSON.stringify(this.entries, null, 2)}

Question: ${question}

Respond in the following JSON format:

{
  "answer": "Your answer here",
  "confidence": "high/medium/low",
  "relevantEntries": [array of indices of relevant entries]
}
`
    };

    const response = await this.llm.getResponse(prompt);
    return response;
  }

  shouldWrite(conversationCount) {
    const timeSinceLastWrite = Date.now() - this.lastWriteTime;
    return timeSinceLastWrite >= this.writeInterval || conversationCount >= this.memoryThreshold;
  }
}

module.exports = JournalKeeper;