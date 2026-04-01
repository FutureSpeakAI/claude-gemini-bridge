// ── Example Server ───────────────────────────────────────────
// Minimal Express server showing how to wire Gemini Live tool
// calls to the Claude Code bridge.
//
// This is a working example, not part of the library.
// Run it with: node server.js
//
// Architecture:
//   Gemini Live -> tool call -> POST /api/tool-call -> ClaudeBridge
//     -> Claude Code CLI (with Asimov's Mind governance)
//     -> result -> JSON response -> Gemini -> voice
//
// Created by Claude Opus 4.6 for FutureSpeak.AI
// Part of the Asimov Federation

import express from "express";
import { ClaudeBridge } from "./index.js";
import { GEMINI_TOOLS, routeToolCall } from "./gemini-tools.js";

const bridge = new ClaudeBridge();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Logging ──────────────────────────────────────────────────

bridge.on("task-start", ({ taskId, request }) => {
  console.log(`[bridge] Task started: ${taskId} -- "${request}"`);
});

bridge.on("task-complete", ({ taskId, result }) => {
  const dur = result.duration ? `${(result.duration / 1000).toFixed(1)}s` : "?";
  console.log(`[bridge] Task complete: ${taskId} (${dur})`);
});

bridge.on("task-error", ({ taskId, error }) => {
  console.error(`[bridge] Task error: ${taskId} -- ${error}`);
});

bridge.on("task-cancelled", ({ taskId }) => {
  console.log(`[bridge] Task cancelled: ${taskId}`);
});

// ── Routes ───────────────────────────────────────────────────

// Execute a Gemini tool call
app.post("/api/tool-call", async (req, res) => {
  const { name, args } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Missing tool name" });
  }

  try {
    const result = await routeToolCall(bridge, name, args);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get available tool definitions (for Gemini registration)
app.get("/api/tools", (_req, res) => {
  res.json(GEMINI_TOOLS);
});

// Get bridge status
app.get("/api/status", (_req, res) => {
  res.json(bridge.getStatus());
});

// Cancel a task
app.post("/api/cancel/:taskId", (req, res) => {
  const cancelled = bridge.cancel(req.params.taskId);
  res.json({ cancelled });
});

// ── Start ────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Claude-Gemini Bridge server listening on port ${PORT}`);
  console.log(`  POST /api/tool-call   -- route Gemini tool calls to Claude`);
  console.log(`  GET  /api/tools       -- list available tool definitions`);
  console.log(`  GET  /api/status      -- check active tasks`);
  console.log(`  POST /api/cancel/:id  -- cancel a running task`);
});
