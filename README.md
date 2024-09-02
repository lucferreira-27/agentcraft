# Minecraft LLM Agent

This project is an experimental Minecraft agent powered by a large language model (LLM). The agent can understand player commands, perceive its environment, and perform actions in the game world.

## Features

* **Natural Language Understanding:** Players can interact with the agent using natural language commands.
* **World Perception:** The agent can perceive its surroundings, including nearby blocks, entities, and its own inventory.
* **Goal-Oriented Action Planning:** The agent can plan and execute sequences of actions to achieve goals.
* **LLM Integration:** The agent uses an LLM to process player commands, reason about the game world, and make decisions.

## Getting Started

1. Clone the repository: `git clone https://github.com/your-username/minecraft-llm-agent.git`
2. Install dependencies: `npm install`
3. Configure environment variables: Create a `.env` file and set the following variables:
    * `MINECRAFT_HOST`
    * `MINECRAFT_PORT`
    * `MINECRAFT_USERNAME`
    * `LLM_PROVIDER` (openai, claude, google, or openrouter)
    * `OPENAI_API_KEY` (if using OpenAI)
    * `CLAUDE_API_KEY` (if using Claude)
    * `GOOGLE_API_KEY` (if using Google)
    * `OPENROUTER_API_KEY` (if using OpenRouter)
4. Start the agent: `npm start`

## Commands

Players can interact with the agent by typing commands in the Minecraft chat. For example:

* "Hello"
* "What's in my inventory?"
* "Go to the nearest tree"
* "Collect 10 wood"
* "Craft a wooden pickaxe"
* "Follow me"

## Contributing

Contributions are welcome! Please open an issue or pull request if you have any suggestions or improvements.

## License

This project is licensed under the ISC License.