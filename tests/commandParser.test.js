 
// tests/commandParser.test.js
const CommandParser = require('../src/commandParser');

test('Parses valid AI action response', () => {
  const aiOutput = JSON.stringify({
    type: 'action',
    goal: {
      intent: 'collect wood',
      priority: 2,
      actions: [
        { type: 'collectBlock', parameters: { blockType: 'oak_log', quantity: 10 } },
      ],
    },
  });

  const parsed = CommandParser.parse(aiOutput);
  expect(parsed.type).toBe('action');
  expect(parsed.goal.intent).toBe('collect wood');
  expect(parsed.goal.priority).toBe(2);
  expect(parsed.goal.actions.length).toBe(1);
});

test('Parses valid AI conversation response', () => {
  const aiOutput = JSON.stringify({
    type: 'conversation',
    message: 'Sure, I can help you gather resources!',
  });

  const parsed = CommandParser.parse(aiOutput);
  expect(parsed.type).toBe('conversation');
  expect(parsed.message).toBe('Sure, I can help you gather resources!');
});