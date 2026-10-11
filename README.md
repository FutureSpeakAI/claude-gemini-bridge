> **This project now lives on in [Agent-Friday](https://github.com/FutureSpeakAI/Agent-Friday), archived 2026-10-11.**

# Claude-Gemini Bridge

**Use Gemini for voice. Use Claude for intelligence. Together, they're Agent Friday.**

---

## Why This Exists

Gemini excels at real-time voice interaction and multimodal understanding. Claude excels at code generation, deep reasoning, and tool use. Instead of choosing one or the other, this bridge lets you use both -- Gemini as the voice and eyes, Claude as the mind.

The result is Agent Friday: a voice AI assistant that can see, hear, speak, code, reason, and act.

## Architecture

```
User speaks
  |
  v
Gemini Live (real-time voice I/O, vision, multimodal)
  |
  | tool call (e.g. "execute_code_task")
  v
Express Server (/api/tool-call)
  |
  v
ClaudeBridge
  |
  | spawns subprocess
  v
Claude Code CLI (with Asimov's Mind hooks active)
  |
  | result (JSON or text)
  v
Express Server
  |
  v
Gemini Live
  |
  v
User hears the response
```

**Two-phase response pattern:**
- **Quick tasks** (< 30s): Block and return the result directly
- **Long tasks**: Return an acknowledgment immediately, emit `task-complete` when done

## Install

```bash
npm install @asimov-federation/claude-gemini-bridge
```

Or clone and use directly:

```bash
git clone https://github.com/asimov-federation/claude-gemini-bridge.git
cd claude-gemini-bridge
```

**Requirements:**
- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Zero npm dependencies (uses only Node builtins)

## Quick Start

```javascript
import { ClaudeBridge } from "@asimov-federation/claude-gemini-bridge";

const bridge = new ClaudeBridge();

// Ask Claude something
const { result } = await bridge.execute("Explain the observer pattern in 3 sentences.");
console.log(result.response);

// Run a coding task
const { result: codeResult } = await bridge.execute("Add input validation to server.js", {
  workDir: "/path/to/project",
});

// Start a long task in the background
const { taskId } = bridge.executeAsync("Refactor the entire auth module to use JWT");
bridge.on("task-complete", ({ taskId, result }) => {
  console.log(`Task ${taskId} finished:`, result.response);
});
```

## API Reference

### `new ClaudeBridge(config?)`

| Option | Default | Description |
|---|---|---|
| `maxConcurrent` | `3` | Maximum parallel Claude tasks |
| `quickTimeout` | `30000` | Timeout for quick tasks (ms) |
| `longTimeout` | `300000` | Timeout for long tasks (ms) |
| `claudeCmd` | auto-detect | `claude.cmd` on Windows, `claude` on Unix |
| `defaultWorkDir` | `process.cwd()` | Default working directory for Claude |
| `flags` | `['--dangerously-skip-permissions', '-p']` | CLI flags passed before the prompt |

### `bridge.execute(request, options?)`

Send a prompt to Claude and wait for the result.

**Returns:** `Promise<{ taskId, immediate: true, result: { success, response, costUsd?, duration } }>`

**Options:**
- `workDir` -- override working directory
- `longRunning` -- use long timeout (300s instead of 30s)
- `outputFormat` -- Claude output format (default: `"json"`)

### `bridge.executeAsync(request, options?)`

Start a long-running task in the background. Returns immediately.

**Returns:** `{ taskId, pending: true }`

Listen for results via events:
```javascript
bridge.on("task-complete", ({ taskId, result }) => { });
bridge.on("task-error", ({ taskId, error }) => { });
```

### `bridge.getStatus()`

Get all active tasks.

**Returns:** `{ activeTasks: [{ id, request, status, elapsed }], count }`

### `bridge.cancel(taskId)`

Kill a running task's subprocess.

**Returns:** `boolean` (true if found and cancelled)

### Events

| Event | Payload | When |
|---|---|---|
| `task-start` | `{ taskId, request }` | A task begins execution |
| `task-complete` | `{ taskId, result }` | A task finishes successfully |
| `task-error` | `{ taskId, error }` | A task fails |
| `task-cancelled` | `{ taskId }` | A task is cancelled |

## Gemini Tool Definitions

The `gemini-tools.js` module exports tool declarations formatted for the Gemini function-calling API. Register these with Gemini Live so it knows when to route to Claude:

```javascript
import { GEMINI_TOOLS, routeToolCall } from "@asimov-federation/claude-gemini-bridge/gemini-tools";
```

| Tool | Purpose |
|---|---|
| `execute_code_task` | Send a coding task to Claude (write, edit, debug, refactor) |
| `ask_claude` | Ask a question requiring deep reasoning or analysis |
| `run_command` | Execute a shell command via Claude |
| `long_task` | Start a background task (large refactors, test suites) |
| `check_task` | Check status of background tasks |

### Routing helper

```javascript
import { routeToolCall } from "@asimov-federation/claude-gemini-bridge/gemini-tools";

// In your Express handler:
app.post("/api/tool-call", async (req, res) => {
  const { name, args } = req.body;
  const result = await routeToolCall(bridge, name, args);
  res.json(result);
});
```

## Example Server

A complete working Express server is included:

```bash
npm run example
# or
node server.js
```

This starts a server on port 3000 with:
- `POST /api/tool-call` -- route Gemini tool calls to Claude
- `GET /api/tools` -- list available tool definitions
- `GET /api/status` -- check active tasks
- `POST /api/cancel/:taskId` -- cancel a running task

## How It Works with Asimov's Mind

When the Claude Code CLI runs, it operates within the Asimov's Mind governance framework. This means:

- **cLaw hooks are active** -- Claude's actions are governed by the cLaw specification (Asimov-inspired safety constraints for AI agents)
- **Approval routing** -- destructive operations can be routed back through the voice channel for human approval
- **Privacy shield** -- PII is scrubbed before crossing API boundaries
- **Audit trail** -- all Claude operations are logged

The bridge itself is governance-transparent: it passes requests to Claude Code, which enforces cLaw internally. The bridge does not bypass or override any safety constraints.

## Tests

```bash
npm test
```

Uses Node's built-in test runner. No test dependencies required.

## Credits

- **[FutureSpeak.AI](https://futurespeak.ai)** -- the company behind Agent Friday
- **Claude Opus 4.6** -- created this bridge
- **[Asimov Federation](https://github.com/asimov-federation)** -- the open governance framework

---

*The voice of Agent Friday runs through Gemini. The mind runs through Claude. The governance runs through Asimov's cLaws.*

---

**See also:**
- [Agent Friday](https://github.com/asimov-federation/friday-voice) -- the voice AI assistant
- [Asimov's Mind](https://github.com/asimov-federation/asimovs-mind) -- AI governance framework
- [cLaw Specification](https://github.com/asimov-federation/claw-spec) -- safety constraints for AI agents
