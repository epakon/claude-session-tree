import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Registry, type ForkRecord } from "../src/registry.js";

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "session-tree-test-"));
}

export function tempRegistry(): Registry {
  return new Registry(join(tempDir(), "session-tree"));
}

export function writeTranscript(projectsRoot: string, sessionId: string, records: object[]): string {
  const dir = join(projectsRoot, "-tmp-project");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sessionId}.jsonl`);
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  return path;
}

let counter = 0;

export function user(text: string, extra: object = {}): object {
  counter++;
  return { type: "user", uuid: `u-${counter}`, timestamp: `2026-11-11T10:00:${String(counter % 60).padStart(2, "0")}Z`, message: { role: "user", content: text }, ...extra };
}

export function assistant(text: string): object {
  counter++;
  return { type: "assistant", uuid: `a-${counter}`, timestamp: `2026-11-11T10:00:${String(counter % 60).padStart(2, "0")}Z`, message: { role: "assistant", content: [{ type: "text", text }] } };
}

export function fork(overrides: Partial<ForkRecord> = {}): ForkRecord {
  return {
    forkId: "child001",
    label: "f1",
    topic: "Topic",
    scope: null,
    parentSessionId: "parent-1",
    parentTranscript: null,
    forkPointUuid: null,
    forkPointAt: "2026-11-11T10:00:00Z",
    childSessionId: "child001-0000-0000-0000-000000000000",
    childTranscript: null,
    cwd: "/tmp/project",
    createdAt: "2026-11-11T10:00:00Z",
    launchedAt: "2026-11-11T10:00:05Z",
    returnedAt: null,
    deliveredAt: null,
    ...overrides,
  };
}
