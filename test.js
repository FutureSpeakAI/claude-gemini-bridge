// ── Tests ────────────────────────────────────────────────────
// Run with: node --test test.js
//
// Uses Node's built-in test runner (no dependencies).
// Mocks child_process.spawn for execution tests.

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { ClaudeBridge } from "./index.js";
import { GEMINI_TOOLS, routeToolCall } from "./gemini-tools.js";

// ── ClaudeBridge: Constructor & Defaults ─────────────────────

describe("ClaudeBridge", () => {
  describe("constructor", () => {
    it("instantiates with defaults", () => {
      const bridge = new ClaudeBridge();
      assert.equal(bridge.config.maxConcurrent, 3);
      assert.equal(bridge.config.quickTimeout, 30_000);
      assert.equal(bridge.config.longTimeout, 300_000);
      assert.ok(bridge.config.claudeCmd);
      assert.ok(bridge.config.defaultWorkDir);
      assert.deepEqual(bridge.config.flags, [
        "--dangerously-skip-permissions",
        "-p",
      ]);
    });

    it("accepts custom config overrides", () => {
      const bridge = new ClaudeBridge({
        maxConcurrent: 5,
        quickTimeout: 10_000,
        longTimeout: 600_000,
        claudeCmd: "/usr/local/bin/claude",
        defaultWorkDir: "/tmp",
        flags: ["--verbose", "-p"],
      });
      assert.equal(bridge.config.maxConcurrent, 5);
      assert.equal(bridge.config.quickTimeout, 10_000);
      assert.equal(bridge.config.longTimeout, 600_000);
      assert.equal(bridge.config.claudeCmd, "/usr/local/bin/claude");
      assert.equal(bridge.config.defaultWorkDir, "/tmp");
      assert.deepEqual(bridge.config.flags, ["--verbose", "-p"]);
    });

    it("merges partial config with defaults", () => {
      const bridge = new ClaudeBridge({ maxConcurrent: 10 });
      assert.equal(bridge.config.maxConcurrent, 10);
      assert.equal(bridge.config.quickTimeout, 30_000); // kept default
      assert.equal(bridge.config.longTimeout, 300_000); // kept default
    });
  });

  // ── Status ───────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns empty when no tasks are active", () => {
      const bridge = new ClaudeBridge();
      const status = bridge.getStatus();
      assert.deepEqual(status, { activeTasks: [], count: 0 });
    });
  });

  // ── Max Concurrent Enforcement ─────────────────────────────

  describe("max concurrent enforcement", () => {
    it("rejects execute when at capacity", async () => {
      const bridge = new ClaudeBridge({ maxConcurrent: 0 });
      const result = await bridge.execute("test");
      assert.equal(result.taskId, null);
      assert.equal(result.result.success, false);
      assert.ok(result.result.error.includes("Too many"));
    });

    it("rejects executeAsync when at capacity", () => {
      const bridge = new ClaudeBridge({ maxConcurrent: 0 });
      const result = bridge.executeAsync("test");
      assert.equal(result.taskId, null);
      assert.ok(result.error.includes("Too many"));
    });
  });

  // ── Event Emission ─────────────────────────────────────────

  describe("events", () => {
    it("emits task-start when execute begins", async () => {
      const bridge = new ClaudeBridge({
        claudeCmd: process.platform === "win32" ? "cmd /c echo" : "echo",
      });

      let startEvent = null;
      bridge.on("task-start", (ev) => {
        startEvent = ev;
      });

      // This will actually run "echo" which returns quickly
      await bridge.execute("hello");
      assert.ok(startEvent);
      assert.ok(startEvent.taskId.startsWith("claude-"));
      assert.ok(startEvent.request);
    });

    it("emits task-complete on successful execution", async () => {
      const bridge = new ClaudeBridge({
        claudeCmd: process.platform === "win32" ? "cmd /c echo" : "echo",
      });

      let completeEvent = null;
      bridge.on("task-complete", (ev) => {
        completeEvent = ev;
      });

      await bridge.execute("hello");
      assert.ok(completeEvent);
      assert.ok(completeEvent.taskId);
      assert.ok(completeEvent.result);
    });

    it("emits task-error on failed execution", async () => {
      const bridge = new ClaudeBridge({
        claudeCmd: "nonexistent_binary_that_does_not_exist_xyz",
      });

      let errorEvent = null;
      bridge.on("task-error", (ev) => {
        errorEvent = ev;
      });

      const result = await bridge.execute("hello");
      assert.equal(result.result.success, false);
      assert.ok(errorEvent);
      assert.ok(errorEvent.error);
    });
  });

  // ── Cancel ─────────────────────────────────────────────────

  describe("cancel", () => {
    it("returns false for unknown taskId", () => {
      const bridge = new ClaudeBridge();
      assert.equal(bridge.cancel("nonexistent"), false);
    });

    it("emits task-cancelled when cancelling an active task", async () => {
      // Start a slow task, then cancel it
      const bridge = new ClaudeBridge({
        claudeCmd:
          process.platform === "win32"
            ? "cmd /c ping -n 10 127.0.0.1"
            : "sleep",
        flags: [],
      });

      let cancelledEvent = null;
      bridge.on("task-cancelled", (ev) => {
        cancelledEvent = ev;
      });

      // Start task in background (don't await)
      const prompt = process.platform === "win32" ? "" : "10";
      bridge.execute(prompt, { longRunning: true });

      // Give it a moment to start
      await new Promise((r) => setTimeout(r, 500));

      const status = bridge.getStatus();
      if (status.count > 0) {
        const taskId = status.activeTasks[0].id;
        const cancelled = bridge.cancel(taskId);
        assert.equal(cancelled, true);
        assert.ok(cancelledEvent);
        assert.equal(cancelledEvent.taskId, taskId);
      }
    });
  });

  // ── Task ID Incrementing ───────────────────────────────────

  describe("task IDs", () => {
    it("increments task IDs across calls", async () => {
      const bridge = new ClaudeBridge({
        claudeCmd: process.platform === "win32" ? "cmd /c echo" : "echo",
      });

      const r1 = await bridge.execute("first");
      const r2 = await bridge.execute("second");
      assert.equal(r1.taskId, "claude-1");
      assert.equal(r2.taskId, "claude-2");
    });
  });

  // ── Execute returns proper structure ───────────────────────

  describe("execute result shape", () => {
    it("returns taskId, immediate, and result", async () => {
      const bridge = new ClaudeBridge({
        claudeCmd: process.platform === "win32" ? "cmd /c echo" : "echo",
      });

      const result = await bridge.execute("hello");
      assert.ok("taskId" in result);
      assert.ok("immediate" in result);
      assert.ok("result" in result);
      assert.equal(result.immediate, true);
    });
  });

  // ── executeAsync returns proper structure ──────────────────

  describe("executeAsync result shape", () => {
    it("returns taskId and pending flag", () => {
      const bridge = new ClaudeBridge({
        claudeCmd: process.platform === "win32" ? "cmd /c echo" : "echo",
      });

      const result = bridge.executeAsync("hello");
      assert.ok("taskId" in result);
      assert.equal(result.pending, true);
    });
  });
});

// ── Gemini Tools ─────────────────────────────────────────────

describe("GEMINI_TOOLS", () => {
  it("exports an array of tool definitions", () => {
    assert.ok(Array.isArray(GEMINI_TOOLS));
    assert.ok(GEMINI_TOOLS.length > 0);
  });

  it("contains all expected tool names", () => {
    const names = GEMINI_TOOLS.map((t) => t.name);
    assert.ok(names.includes("execute_code_task"));
    assert.ok(names.includes("ask_claude"));
    assert.ok(names.includes("run_command"));
    assert.ok(names.includes("long_task"));
    assert.ok(names.includes("check_task"));
  });

  it("each tool has name, description, and parameters", () => {
    for (const tool of GEMINI_TOOLS) {
      assert.ok(tool.name, "tool must have a name");
      assert.ok(tool.description, "tool must have a description");
      assert.ok(tool.parameters, "tool must have parameters");
      assert.equal(tool.parameters.type, "object");
    }
  });
});

// ── routeToolCall ────────────────────────────────────────────

describe("routeToolCall", () => {
  it("routes check_task to getStatus", async () => {
    const bridge = new ClaudeBridge();
    const result = await routeToolCall(bridge, "check_task", {});
    assert.deepEqual(result, { activeTasks: [], count: 0 });
  });

  it("returns error for unknown tool", async () => {
    const bridge = new ClaudeBridge();
    const result = await routeToolCall(bridge, "nonexistent", {});
    assert.equal(result.success, false);
    assert.ok(result.error.includes("Unknown tool"));
  });
});
