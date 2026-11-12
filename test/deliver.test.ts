import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deliver } from "../src/deliver.js";
import { fork, tempRegistry } from "./helpers.js";

const NOW = "2026-11-11T12:00:00Z";

describe("deliver", () => {
  it("delivers returned results once, oldest first, and clears the marker", () => {
    const registry = tempRegistry();
    registry.saveFork(fork({ forkId: "b", label: "f2", topic: "Second", childSessionId: "b-child", returnedAt: "2026-11-11T11:00:00Z" }));
    registry.saveFork(fork({ forkId: "a", label: "f1", topic: "First", childSessionId: "a-child", returnedAt: "2026-11-11T10:30:00Z" }));
    registry.saveFork(fork({ forkId: "c", label: "f3", topic: "Open", childSessionId: "c-child" }));
    registry.writeResult("a", "result A");
    registry.writeResult("b", "result B");
    registry.markPending("parent-1");

    const first = deliver(registry, "parent-1", NOW);
    expect(first.delivered.map((f) => f.label)).toEqual(["f1", "f2"]);
    expect(first.additionalContext!.indexOf("result A")).toBeLessThan(first.additionalContext!.indexOf("result B"));
    expect(first.systemMessage).toBe('Session Tree: merged f1 "First", f2 "Second"');
    expect(registry.getFork("a")!.deliveredAt).toBe(NOW);
    expect(registry.hasPending("parent-1")).toBe(false);

    const second = deliver(registry, "parent-1", NOW);
    expect(second.additionalContext).toBeNull();
  });

  it("truncates a long result and points to the full file", () => {
    const registry = tempRegistry();
    registry.saveFork(fork({ forkId: "a", returnedAt: NOW }));
    registry.writeResult("a", "x".repeat(5000));
    const { additionalContext } = deliver(registry, "parent-1", NOW);
    expect(additionalContext).toContain("[Result truncated at 4000 characters. Full result: ");
    expect(additionalContext!.length).toBeLessThan(10_000);
  });

  it("defers results beyond the delivery cap and keeps the marker", () => {
    const registry = tempRegistry();
    for (const [i, id] of ["a", "b", "c"].entries()) {
      registry.saveFork(fork({ forkId: id, label: `f${i + 1}`, childSessionId: `${id}-child`, returnedAt: `2026-11-11T10:0${i}:00Z` }));
      registry.writeResult(id, "y".repeat(3900));
    }
    registry.markPending("parent-1");

    const first = deliver(registry, "parent-1", NOW);
    expect(first.delivered.map((f) => f.label)).toEqual(["f1", "f2"]);
    expect(first.deferred.map((f) => f.label)).toEqual(["f3"]);
    expect(first.additionalContext).toContain("will arrive with the next message");
    expect(first.additionalContext!.length).toBeLessThan(10_000);
    expect(registry.hasPending("parent-1")).toBe(true);

    const second = deliver(registry, "parent-1", NOW);
    expect(second.delivered.map((f) => f.label)).toEqual(["f3"]);
    expect(registry.hasPending("parent-1")).toBe(false);
  });

  it("respects resultCap from config.json", () => {
    const registry = tempRegistry();
    registry.saveFork(fork({ forkId: "a", returnedAt: NOW }));
    registry.writeResult("a", "z".repeat(200));
    writeFileSync(join(registry.root, "config.json"), JSON.stringify({ resultCap: 100 }));
    expect(deliver(registry, "parent-1", NOW).additionalContext).toContain("truncated at 100 characters");
  });
});
