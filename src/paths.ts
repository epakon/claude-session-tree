import { homedir } from "node:os";
import { join } from "node:path";

export type Env = Record<string, string | undefined>;

export function configDir(env: Env = process.env): string {
  return env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export function registryDir(env: Env = process.env): string {
  return env.SESSION_TREE_DIR || join(configDir(env), "session-tree");
}

export function projectsDir(env: Env = process.env): string {
  return join(configDir(env), "projects");
}
