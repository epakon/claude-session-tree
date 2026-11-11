import type { ForkRecord, Registry } from "./registry.js";

export interface Delivery {
  additionalContext: string | null;
  systemMessage: string | null;
  delivered: ForkRecord[];
  deferred: ForkRecord[];
}

const HEADER =
  "Results returned from forked sessions (session-tree plugin). Each fork worked on a subtopic of this conversation; treat its result as the outcome of that subtopic.";

export function waitingForks(registry: Registry, parentSessionId: string): ForkRecord[] {
  return registry
    .forksOfParent(parentSessionId)
    .filter((fork) => fork.returnedAt && !fork.deliveredAt)
    .sort((a, b) => a.returnedAt!.localeCompare(b.returnedAt!));
}

export function renderResult(registry: Registry, fork: ForkRecord, resultCap: number): string {
  const result = (registry.readResult(fork.forkId) ?? "").trim();
  const body =
    result.length > resultCap
      ? `${result.slice(0, resultCap)}\n\n[Result truncated at ${resultCap} characters. Full result: ${registry.resultPath(fork.forkId)}]`
      : result;
  return `## Fork ${fork.label} "${fork.topic}" returned\n(fork session ${fork.childSessionId})\n\n${body}`;
}

/** Builds hook output for the parent's waiting results, oldest first, within the delivery cap, and marks them delivered. */
export function deliver(registry: Registry, parentSessionId: string, now: string): Delivery {
  const { resultCap, deliveryCap } = registry.config();
  const waiting = waitingForks(registry, parentSessionId);
  const sections: string[] = [];
  const delivered: ForkRecord[] = [];
  const deferred: ForkRecord[] = [];
  let size = HEADER.length;

  for (const fork of waiting) {
    const section = renderResult(registry, fork, resultCap);
    if (delivered.length > 0 && size + section.length + 2 > deliveryCap) {
      deferred.push(fork);
      continue;
    }
    sections.push(section);
    size += section.length + 2;
    delivered.push(fork);
  }

  if (deferred.length) {
    sections.push(
      `More fork results are waiting and will arrive with the next message: ${deferred.map((fork) => `${fork.label} "${fork.topic}"`).join(", ")}.`,
    );
  }

  for (const fork of delivered) registry.saveFork({ ...fork, deliveredAt: now });
  if (!deferred.length) registry.clearPending(parentSessionId);

  if (!delivered.length) return { additionalContext: null, systemMessage: null, delivered, deferred };
  return {
    additionalContext: [HEADER, ...sections].join("\n\n"),
    systemMessage: `session-tree: merged ${delivered.map((fork) => `${fork.label} "${fork.topic}"`).join(", ")}`,
    delivered,
    deferred,
  };
}
