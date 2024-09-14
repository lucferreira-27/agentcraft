# Minecraft AI Companion 
 
This is a placeholder README file. Please update it with your project details. 
# Minecraft AI Companion

## Overview

An autonomous, conversational AI companion for Minecraft built using Mineflayer and Google Gemini 1.5-Flash. The AI can understand natural language commands, engage in conversations, execute in-game actions, and manage multiple goals intelligently.

## Features

- **Natural Language Understanding**: Interpret and act upon player commands using Google Gemini.
- **Conversational Abilities**: Engage in two-way conversations with players.
- **Action Execution**: Perform various in-game actions like moving, collecting blocks, following players, etc.
- **Goal Management**: Handle multiple goals with prioritization and smart queueing.
- **Memory and Adaptation**: Remember past interactions and adapt behavior accordingly.
- **Robust Error Handling**: Ensure smooth operation with comprehensive error management.


## TODO: 

### GoalManager Improvements

   Based on a senior engineer's review, the following improvements are suggested for the GoalManager:

   1. **Concurrency Handling**: Implement proper concurrency controls to ensure thread-safe operations when adding and processing goals.

   2. **Robust Error Handling**: Enhance error handling to include retry mechanisms for failed goals and user notifications.

   3. **Efficient Priority Queue**: Replace the current priority queue implementation with a more efficient data structure for better performance with large numbers of goals.

   4. **Improved Interruption Mechanism**: Implement a more efficient interruption mechanism instead of relying on polling a boolean flag.

   5. **Enhanced Action Tracking**: Expand the use of the `ongoingActions` Map to provide a comprehensive view of the bot's current state.

   6. **Goal Persistence**: Implement a mechanism to persist goals across bot restarts or crashes.

   7. **Goal Cancellation**: Add functionality to cancel queued goals that haven't started processing yet.

   8. **Decoupling**: Reduce coupling between GoalManager and ActionExecutor for improved testability and flexibility.

   9. **Granular Goal States**: Implement more detailed goal states (e.g., "queued", "in progress", "completed", "failed") for better state management.

   10. **Goal Dependencies**: Add support for specifying dependencies between goals for complex tasks.

   11. **Global Timeout Handling**: Implement a global timeout mechanism for goals to prevent indefinite execution.

   12. **Pause and Resume Functionality**: Add the ability to pause the execution of goals and resume later.




## Setup and Installation

### Prerequisites
- Java (for running the Minecraft server)

### 1. Environment Setup

####  Minecraft Server Setup
1. Choose Server Type: [PaperMC](https://papermc.io/) is recommended for performance.
2. Install and configure the server:
   ```bash
   mkdir minecraft-server
   cd minecraft-server
   wget https://papermc.io/api/v2/projects/paper/versions/1.20.1/builds/100/downloads/paper-1.20.1-100.jar -O server.jar
   java -jar server.jar --nogui 
   ```
3. Configure the server:
   - Accept the EULA: Open `eula.txt` and set `eula=true`
   - Edit `server.properties`:
     - Set `online-mode=false` to enable bot connections
     - Ensure the server port matches the one you'll use in the bot's `.env` file (default is 25565)

####  Google Gemini API Setup
1. Read the [Google Gemini API documentation](https://ai.google.dev/gemini-api/docs)
2. Obtain an API key for Gemini v1.5-Flash (other models may work but are not officially supported)

### 2. Project Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/lucferreira-27/agentcraft.git
   cd agentcraft
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### 3. Configuration

1. Create a `.env` file in the root directory with the following content:
   ```env
   MINECRAFT_HOST=localhost
   MINECRAFT_PORT=25565
   BOT_USERNAME=AICompanion
   GEMINI_API_KEY=your_gemini_api_key
   ```
   Replace `your_gemini_api_key` with the API key you obtained in step 1b.

### 4. Running the Bot

Start the bot with the following command:

```bash
npm start
```

**Note**: Ensure that your Minecraft server is running before starting the bot.

## Usage

- **Interact in-Game**: Use the in-game chat to send commands or have conversations with the AI companion.
- **Commands**:
    - **Collect Blocks**: `Collect 10 oak_logs`
    - **Follow Player**: `Follow me`
    - **Build Structure**: `Build a stone house at (100, 64, 200)`
    - **Attack Entity**: `Attack zombies nearby`
    - **Conversational**: `Hello, how are you?`

## Contributing

Contributions are welcome! Please open issues and submit pull requests for improvements and new features.

## License

[MIT License](LICENSE)