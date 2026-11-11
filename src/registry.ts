import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite, readJson, readText, removeFile } from "./fsutil.js";

export interface ForkRecord {
  forkId: string;
  label: string;
  topic: string;
  scope: string | null;
  parentSessionId: string;
  parentTranscript: string | null;
  forkPointUuid: string | null;
  forkPointAt: string;
  childSessionId: string;
  childTranscript: string | null;
  cwd: string;
  createdAt: string;
  launchedAt: string | null;
  returnedAt: string | null;
  deliveredAt: string | null;
}

export interface SessionRecord {
  sessionId: string;
  transcriptPath: string | null;
  cwd: string | null;
  lastSource: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface Config {
  resultCap: number;
  deliveryCap: number;
  liveDelivery: boolean;
  terminal: "Terminal" | "print";
}

export const DEFAULT_CONFIG: Config = {
  resultCap: 4000,
  deliveryCap: 9500,
  liveDelivery: false,
  terminal: "Terminal",
};

export class Registry {
  constructor(readonly root: string) {}

  get forksDir(): string {
    return join(this.root, "forks");
  }

  forkPath(forkId: string): string {
    return join(this.forksDir, `${forkId}.json`);
  }

  briefPath(forkId: string): string {
    return join(this.root, "briefs", `${forkId}.md`);
  }

  resultPath(forkId: string): string {
    return join(this.root, "results", `${forkId}.md`);
  }

  launchPath(forkId: string): string {
    return join(this.root, "launch", `${forkId}.sh`);
  }

  pendingPath(parentSessionId: string): string {
    return join(this.root, "pending", parentSessionId);
  }

  sessionPath(sessionId: string): string {
    return join(this.root, "sessions", `${sessionId}.json`);
  }

  get treePath(): string {
    return join(this.root, "tree.html");
  }

  config(): Config {
    return { ...DEFAULT_CONFIG, ...(readJson<Partial<Config>>(join(this.root, "config.json")) ?? {}) };
  }

  listForks(): ForkRecord[] {
    if (!existsSync(this.forksDir)) return [];
    return readdirSync(this.forksDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson<ForkRecord>(join(this.forksDir, name)))
      .filter((fork): fork is ForkRecord => fork !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getFork(forkId: string): ForkRecord | null {
    return readJson<ForkRecord>(this.forkPath(forkId));
  }

  saveFork(fork: ForkRecord): void {
    atomicWrite(this.forkPath(fork.forkId), JSON.stringify(fork, null, 2) + "\n");
  }

  forksOfParent(parentSessionId: string): ForkRecord[] {
    return this.listForks().filter((fork) => fork.parentSessionId === parentSessionId);
  }

  findForkByChild(childSessionId: string): ForkRecord | null {
    return this.listForks().find((fork) => fork.childSessionId === childSessionId) ?? null;
  }

  /** Resolves a fork ID, or a label such as "f3" among the given parent's forks. */
  resolveFork(ref: string, parentSessionId?: string): ForkRecord | null {
    const byId = this.getFork(ref);
    if (byId) return byId;
    if (!parentSessionId) return null;
    return this.forksOfParent(parentSessionId).find((fork) => fork.label === ref) ?? null;
  }

  nextLabel(parentSessionId: string): string {
    return `f${this.forksOfParent(parentSessionId).length + 1}`;
  }

  writeBrief(forkId: string, text: string): void {
    atomicWrite(this.briefPath(forkId), text);
  }

  readBrief(forkId: string): string | null {
    return readText(this.briefPath(forkId));
  }

  writeResult(forkId: string, text: string): void {
    atomicWrite(this.resultPath(forkId), text);
  }

  readResult(forkId: string): string | null {
    return readText(this.resultPath(forkId));
  }

  markPending(parentSessionId: string): void {
    atomicWrite(this.pendingPath(parentSessionId), "");
  }

  clearPending(parentSessionId: string): void {
    removeFile(this.pendingPath(parentSessionId));
  }

  hasPending(parentSessionId: string): boolean {
    return existsSync(this.pendingPath(parentSessionId));
  }

  getSession(sessionId: string): SessionRecord | null {
    return readJson<SessionRecord>(this.sessionPath(sessionId));
  }

  listSessions(): SessionRecord[] {
    const dir = join(this.root, "sessions");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson<SessionRecord>(join(dir, name)))
      .filter((session): session is SessionRecord => session !== null);
  }

  recordSession(input: { sessionId: string; transcriptPath?: string | null; cwd?: string | null; source?: string | null }, now: string): SessionRecord {
    const existing = this.getSession(input.sessionId);
    const record: SessionRecord = {
      sessionId: input.sessionId,
      transcriptPath: input.transcriptPath ?? existing?.transcriptPath ?? null,
      cwd: input.cwd ?? existing?.cwd ?? null,
      lastSource: input.source ?? existing?.lastSource ?? null,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    };
    atomicWrite(this.sessionPath(input.sessionId), JSON.stringify(record, null, 2) + "\n");
    return record;
  }
}
