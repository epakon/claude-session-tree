#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [mode, ...args] = process.argv.slice(2);
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "out");
mkdirSync(outDir, { recursive: true });

const stdin = mode === "heredoc" ? readFileSync(0, "utf8") : "";
appendFileSync(join(outDir, "echo.jsonl"), JSON.stringify({ mode, args, stdin, at: new Date().toISOString() }) + "\n");

process.stdout.write(`ECHO mode=${mode} args=${JSON.stringify(args)} stdin=${JSON.stringify(stdin)}\n`);
