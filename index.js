// ── Claude-Gemini Bridge ─────────────────────────────────────
// Bridges Gemini Live voice to Claude Code CLI intelligence.
// The spine of Agent Friday OS.
//
// Architecture:
//   User speaks -> Gemini Live (voice I/O, multimodal)
//     -> tool call -> Express server -> ClaudeBridge
//       -> Claude Code CLI subprocess (with Asimov's Mind hooks)
//       -> result -> Express -> Gemini -> voice response
//
// Two-phase response pattern:
//   - Quick tasks (< 30s): block and return result
//   - Long tasks: return acknowledgment, inject result when done
//
// Pure ESM, zero dependencies (Node builtins only).
//
// Created by Claude Opus 4.6 for FutureSpeak.AI
// Part of the Asimov Federation

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

const DEFAULTS = {
  maxConcurrent: 3,
  quickTimeout: 30_000,
  longTimeout: 300_000,
  claudeCmd: process.platform === "win32" ? "claude.cmd" : "claude",
  defaultWorkDir: process.cwd(),
  flags: ["--dangerously-skip-permissions", "-p"],
};

export class ClaudeBridge extends EventEmitter {
  /**
   * @param {object} config
   * @param {number}  [config.maxConcurrent=3]       Max parallel Claude tasks
   * @param {number}  [config.quickTimeout=30000]     Timeout for quick tasks (ms)
   * @param {number}  [config.longTimeout=300000]     Timeout for long tasks (ms)
   * @param {string}  [config.claudeCmd]              Path or name of claude CLI (auto-detected)
   * @param {string}  [config.defaultWorkDir]         Working directory for Claude (cwd by default)
   * @param {string[]} [config.flags]                 CLI flags passed before the prompt
   */
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULTS, ...config };
    this.activeTasks = new Map();
    this.taskCounter = 0;
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Execute a request synchronously (blocks until Claude responds).
   * Returns { taskId, immediate: true, result }
   *
   * @param {string} request  The prompt to send to Claude
   * @param {object} options
   * @param {string} [options.workDir]      Override working directory
   * @param {boolean} [options.longRunning]  Use long timeout
   * @param {string} [options.outputFormat]  Claude output format (default: "json")
   * @returns {Promise<{ taskId: string|null, immediate: boolean, result: object }>}
   */
  async execute(request, options = {}) {
    if (this.activeTasks.size >= this.config.maxConcurrent) {
      return {
        taskId: null,
        immediate: true,
        result: {
          success: false,
          error: "Too many active tasks. Wait for one to finish.",
        },
      };
    }

    const taskId = `claude-${++this.taskCounter}`;
    const workDir = options.workDir || this.config.defaultWorkDir;
    const isLongRunning = options.longRunning || false;
    const outputFormat = options.outputFormat || "json";

    const task = {
      id: taskId,
      request,
      workDir,
      startTime: Date.now(),
      status: "running",
      process: null,
      result: null,
    };

    this.activeTasks.set(taskId, task);
    this.emit("task-start", { taskId, request: request.substring(0, 100) });

    // Build CLI arguments
    const args = [
      ...this.config.flags,
      request,
      "--output-format",
      outputFormat,
    ];

    const timeout = isLongRunning
      ? this.config.longTimeout
      : this.config.quickTimeout;

    try {
      const result = await this._runClaude(args, workDir, timeout, task);
      task.status = "complete";
      task.result = result;
      this.activeTasks.delete(taskId);
      this.emit("task-complete", { taskId, result });
      return { taskId, immediate: true, result };
    } catch (err) {
      task.status = "error";
      task.result = { success: false, error: err.message };
      this.activeTasks.delete(taskId);
      this.emit("task-error", { taskId, error: err.message });
      return {
        taskId,
        immediate: true,
        result: { success: false, error: err.message },
      };
    }
  }

  /**
   * Execute a long-running task in the background.
   * Returns immediately with { taskId, pending: true }.
   * Emits 'task-complete' or 'task-error' when finished.
   *
   * @param {string} request  The prompt to send to Claude
   * @param {object} options  Same as execute()
   * @returns {{ taskId: string|null, pending?: boolean, error?: string }}
   */
  executeAsync(request, options = {}) {
    if (this.activeTasks.size >= this.config.maxConcurrent) {
      return {
        taskId: null,
        error: "Too many active tasks. Wait for one to finish.",
      };
    }

    // Peek at the next taskId that execute() will create
    const taskId = `claude-${this.taskCounter + 1}`;

    // Fire and forget -- result arrives via event
    this.execute(request, { ...options, longRunning: true })
      .then(() => {})
      .catch(() => {});

    return { taskId, pending: true };
  }

  /**
   * Get status of all active tasks.
   * @returns {{ activeTasks: object[], count: number }}
   */
  getStatus() {
    const tasks = [];
    for (const [id, task] of this.activeTasks) {
      tasks.push({
        id,
        request: task.request.substring(0, 100),
        status: task.status,
        elapsed: Date.now() - task.startTime,
      });
    }
    return { activeTasks: tasks, count: tasks.length };
  }

  /**
   * Cancel an active task by killing its subprocess.
   * @param {string} taskId
   * @returns {boolean} true if the task was found and cancelled
   */
  cancel(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) return false;

    if (task.process) {
      task.process.kill("SIGTERM");
    }
    task.status = "cancelled";
    this.activeTasks.delete(taskId);
    this.emit("task-cancelled", { taskId });
    return true;
  }

  // ── Internal ─────────────────────────────────────────────────

  /**
   * Spawn the Claude CLI and collect its output.
   * @private
   */
  _runClaude(args, workDir, timeout, task) {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const cmd = this.config.claudeCmd;

      // On Windows, use shell mode to resolve .cmd shims
      const fullCmd = `${cmd} ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`;
      const proc = spawn(fullCmd, [], {
        cwd: workDir,
        timeout,
        env: { ...process.env },
        shell: true,
        windowsHide: true,
      });

      task.process = proc;

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        task.process = null;

        if (code !== 0 && code !== null) {
          reject(
            new Error(stderr.trim() || `Claude exited with code ${code}`)
          );
          return;
        }

        // Parse JSON output from Claude CLI
        try {
          const parsed = JSON.parse(stdout);
          resolve({
            success: true,
            response: parsed.result || parsed.message || parsed,
            costUsd: parsed.cost_usd || null,
            duration: Date.now() - task.startTime,
          });
        } catch {
          // Not JSON -- return raw text
          const text = stdout.trim();
          if (text) {
            resolve({
              success: true,
              response: text,
              duration: Date.now() - task.startTime,
            });
          } else {
            reject(
              new Error(stderr.trim() || "Claude returned empty output")
            );
          }
        }
      });

      proc.on("error", (err) => {
        task.process = null;
        reject(new Error(`Failed to start Claude: ${err.message}`));
      });
    });
  }
}

export default ClaudeBridge;
