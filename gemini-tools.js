// ── Gemini Tool Definitions ──────────────────────────────────
// These are the tool declarations you register with the Gemini
// Live API. When Gemini decides to invoke one, your Express
// server catches the call and routes it through ClaudeBridge.
//
// Format follows the Gemini function-calling schema.
//
// Created by Claude Opus 4.6 for FutureSpeak.AI
// Part of the Asimov Federation

export const GEMINI_TOOLS = [
  {
    name: "execute_code_task",
    description:
      "Send a coding task to Claude Code. Use this for writing, editing, debugging, or refactoring code. Claude will execute the task in the specified working directory with full tool access.",
    parameters: {
      type: "object",
      properties: {
        request: {
          type: "string",
          description:
            "A clear description of the coding task for Claude to perform.",
        },
        workDir: {
          type: "string",
          description:
            "Optional working directory path. Defaults to the server's project root.",
        },
      },
      required: ["request"],
    },
  },
  {
    name: "ask_claude",
    description:
      "Ask Claude a question that requires deep reasoning, code analysis, or multi-step thinking. Use this when the user needs an expert-level answer that goes beyond what quick voice can provide.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            "The question or topic requiring Claude's deep reasoning.",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "run_command",
    description:
      "Execute a shell command via Claude Code. Claude will run the command and return the output. Useful for git operations, npm scripts, file system queries, and other CLI tasks.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        workDir: {
          type: "string",
          description:
            "Optional working directory for the command. Defaults to the server's project root.",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "long_task",
    description:
      "Start a long-running Claude task in the background. Returns immediately with a task ID. Use this for tasks that may take more than 30 seconds: large refactors, full test suites, complex analyses. Check progress with check_task.",
    parameters: {
      type: "object",
      properties: {
        request: {
          type: "string",
          description:
            "A clear description of the long-running task for Claude.",
        },
        workDir: {
          type: "string",
          description: "Optional working directory path.",
        },
      },
      required: ["request"],
    },
  },
  {
    name: "check_task",
    description:
      "Check the status of background Claude tasks. If a taskId is provided, checks that specific task. Otherwise returns all active tasks.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description:
            "Optional task ID to check. Omit to see all active tasks.",
        },
      },
      required: [],
    },
  },
];

/**
 * Helper: route a Gemini tool call to the appropriate ClaudeBridge method.
 *
 * @param {import('./index.js').ClaudeBridge} bridge
 * @param {string} toolName   One of the GEMINI_TOOLS names
 * @param {object} args       The arguments from Gemini's function call
 * @returns {Promise<object>}  The result to send back to Gemini
 */
export async function routeToolCall(bridge, toolName, args = {}) {
  switch (toolName) {
    case "execute_code_task":
      return bridge.execute(args.request, { workDir: args.workDir });

    case "ask_claude":
      return bridge.execute(args.question);

    case "run_command":
      return bridge.execute(`Run this command and return the output: ${args.command}`, {
        workDir: args.workDir,
      });

    case "long_task":
      return bridge.executeAsync(args.request, { workDir: args.workDir });

    case "check_task":
      return bridge.getStatus();

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

export default GEMINI_TOOLS;
