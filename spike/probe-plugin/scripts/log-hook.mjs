#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const started = Date.now();
const event = process.argv[2];
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "out");
mkdirSync(outDir, { recursive: true });

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch (error) {
  input = { parseError: String(error) };
}

appendFileSync(
  join(outDir, "hooks.jsonl"),
  JSON.stringify({ event, at: new Date().toISOString(), input, env: { CLAUDE_PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT } }) + "\n",
);

const output =
  event === "SessionStart"
    ? {
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: "FORK_CONTEXT_TOKEN=amber-7",
          sessionTitle: "[probe] session-tree spike",
        },
      }
    : {
        systemMessage: "st-probe: fork result delivered",
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "PROBE_TOKEN=violet-42",
        },
      };

process.stdout.write(JSON.stringify(output));
appendFileSync(join(outDir, "hooks.jsonl"), JSON.stringify({ event, elapsedMs: Date.now() - started }) + "\n");
