import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface TranscriptRecord {
  type?: string;
  uuid?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  timestamp?: string;
  customTitle?: string;
  aiTitle?: string;
  message?: { role?: string; content?: unknown };
}

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

const OWN_COMMAND = /<command-name>\/?session-tree:/;

export function readRecords(path: string): TranscriptRecord[] {
  if (!existsSync(path)) return [];
  const records: TranscriptRecord[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as TranscriptRecord);
    } catch {
      // A partially written last line is expected while the session is running.
    }
  }
  return records;
}

export function findTranscript(projectsRoot: string, sessionId: string): string | null {
  if (!existsSync(projectsRoot)) return null;
  for (const project of readdirSync(projectsRoot)) {
    const candidate = join(projectsRoot, project, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function textBlocks(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  if (content.some((block) => block?.type === "tool_result")) return null;
  const texts = content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text as string);
  return texts.length ? texts.join("\n") : null;
}

function commandText(text: string): string | null {
  const name = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1]?.trim();
  if (!name) return null;
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim();
  return args ? `${name} ${args}` : name;
}

/** The text a human typed, or null for tool results, meta records, sidechains and harness output. */
export function humanText(record: TranscriptRecord): string | null {
  if (record.type !== "user" || record.isMeta || record.isSidechain) return null;
  const text = textBlocks(record.message?.content);
  if (text === null) return null;
  if (text.includes("<command-name>")) return commandText(text);
  if (text.startsWith("<") || text.startsWith("[Request interrupted")) return null;
  return text;
}

export function assistantText(record: TranscriptRecord): string | null {
  if (record.type !== "assistant" || record.isSidechain) return null;
  return textBlocks(record.message?.content);
}

function isOwnCommand(record: TranscriptRecord): boolean {
  const content = record.message?.content;
  const text = typeof content === "string" ? content : textBlocks(content);
  return record.type === "user" && text !== null && OWN_COMMAND.test(text);
}

/** Index of the last plugin command record (/fork, /return ...), or the record count when there is none. */
function cutoff(records: TranscriptRecord[]): number {
  for (let i = records.length - 1; i >= 0; i--) {
    if (isOwnCommand(records[i]!)) return i;
  }
  return records.length;
}

/** The last conversation record before the current plugin command: the point the fork branches from. */
export function forkPoint(records: TranscriptRecord[]): { uuid: string | null; at: string | null } {
  for (let i = cutoff(records) - 1; i >= 0; i--) {
    const record = records[i]!;
    if ((record.type === "user" || record.type === "assistant") && record.uuid) {
      return { uuid: record.uuid, at: record.timestamp ?? null };
    }
  }
  return { uuid: null, at: null };
}

export function turns(records: TranscriptRecord[]): Turn[] {
  const result: Turn[] = [];
  for (const record of records.slice(0, cutoff(records))) {
    const user = humanText(record);
    if (user !== null) {
      result.push({ role: "user", text: user });
      continue;
    }
    const assistant = assistantText(record);
    if (assistant === null) continue;
    const last = result[result.length - 1];
    if (last?.role === "assistant") last.text += `\n\n${assistant}`;
    else result.push({ role: "assistant", text: assistant });
  }
  return result;
}

/** The last `count` user/assistant exchanges as Markdown, trimmed from the oldest side to fit `maxChars`. */
export function lastExchanges(records: TranscriptRecord[], count: number, maxChars: number): string {
  const all = turns(records);
  let starts = 0;
  let seen = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i]!.role === "user" && ++seen === count) {
      starts = i;
      break;
    }
  }
  const rendered = all
    .slice(starts)
    .map((turn) => `**${turn.role === "user" ? "User" : "Claude"}:**\n${turn.text.trim()}`)
    .join("\n\n");
  return rendered.length > maxChars ? `[earlier part trimmed]\n\n${rendered.slice(rendered.length - maxChars)}` : rendered;
}

export function sessionTitle(records: TranscriptRecord[]): string | null {
  let custom: string | null = null;
  let ai: string | null = null;
  for (const record of records) {
    if (record.type === "custom-title" && record.customTitle) custom = record.customTitle;
    if (record.type === "ai-title" && record.aiTitle) ai = record.aiTitle;
  }
  if (custom ?? ai) return custom ?? ai;
  for (const record of records) {
    const text = humanText(record);
    if (text && !text.startsWith("/")) return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  }
  return null;
}
