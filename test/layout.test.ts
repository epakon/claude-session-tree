import { describe, expect, it } from "vitest";
import { boundsOf, computeLayout, descendantCount, wrapText } from "../src/viewer/layout.js";

const base = { nodeWidth: 100, nodeHeight: 40, gapX: 20, gapY: 60 };
const tree = new Map<string, string[]>([
  ["root", ["a", "b"]],
  ["a", ["a1", "a2"]],
]);

describe("computeLayout", () => {
  it("puts children side by side below their parent and centres the parent over them", () => {
    const p = computeLayout({ ...base, roots: ["root"], childrenOf: tree, folded: new Set() });
    expect(p.get("a1")!.cy).toBe(p.get("a")!.cy + 100);
    expect(p.get("a2")!.cx - p.get("a1")!.cx).toBe(120);
    expect(p.get("a")!.cx).toBe((p.get("a1")!.cx + p.get("a2")!.cx) / 2);
    expect(p.get("root")!.cx).toBe((p.get("a")!.cx + p.get("b")!.cx) / 2);
    expect(p.get("root")!.cy).toBe(20);
  });

  it("never overlaps two nodes on the same level", () => {
    const p = computeLayout({ ...base, roots: ["root"], childrenOf: tree, folded: new Set() });
    const level = ["a1", "a2", "b"].map((id) => p.get(id)!.cx).sort((x, y) => x - y);
    for (let i = 1; i < level.length; i++) expect(level[i]! - level[i - 1]!).toBeGreaterThanOrEqual(base.nodeWidth + base.gapX);
  });

  it("leaves out the descendants of a folded node", () => {
    const p = computeLayout({ ...base, roots: ["root"], childrenOf: tree, folded: new Set(["a"]) });
    expect([...p.keys()].sort()).toEqual(["a", "b", "root"]);
  });

  it("places separate trees next to each other", () => {
    const p = computeLayout({ ...base, roots: ["root", "other"], childrenOf: tree, folded: new Set() });
    const right = Math.max(...["root", "a", "b", "a1", "a2"].map((id) => p.get(id)!.cx + base.nodeWidth / 2));
    expect(p.get("other")!.cx - base.nodeWidth / 2).toBeGreaterThan(right);
  });

  it("places a node once even when the registry contains a cycle", () => {
    const cyclic = new Map<string, string[]>([["x", ["y"]], ["y", ["x"]]]);
    const p = computeLayout({ ...base, roots: ["x"], childrenOf: cyclic, folded: new Set() });
    expect([...p.keys()].sort()).toEqual(["x", "y"]);
  });

  it("returns nothing for no roots", () => {
    expect(computeLayout({ ...base, roots: [], childrenOf: new Map(), folded: new Set() }).size).toBe(0);
  });
});

describe("boundsOf", () => {
  it("covers every node", () => {
    const p = computeLayout({ ...base, roots: ["root"], childrenOf: tree, folded: new Set() });
    const b = boundsOf(p, base.nodeWidth, base.nodeHeight)!;
    for (const { cx, cy } of p.values()) {
      expect(cx - 50).toBeGreaterThanOrEqual(b.x);
      expect(cx + 50).toBeLessThanOrEqual(b.x + b.w);
      expect(cy + 20).toBeLessThanOrEqual(b.y + b.h);
    }
    expect(boundsOf(new Map(), 1, 1)).toBeNull();
  });
});

describe("descendantCount", () => {
  it("counts every hidden node of a branch", () => {
    expect(descendantCount(tree, "root")).toBe(4);
    expect(descendantCount(tree, "a")).toBe(2);
    expect(descendantCount(tree, "b")).toBe(0);
  });
});

describe("wrapText", () => {
  it("wraps on word boundaries", () => {
    expect(wrapText("Config validation of the settings file", 20, 3)).toEqual(["Config validation of", "the settings file"]);
  });

  it("keeps short text on one line", () => {
    expect(wrapText("Config migrations", 25, 3)).toEqual(["Config migrations"]);
  });

  it("ends a text that is too long with an ellipsis", () => {
    const lines = wrapText("one two three four five six seven eight nine ten eleven twelve", 12, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });

  it("cuts a single word that does not fit", () => {
    const lines = wrapText("Supercalifragilisticexpialidocious", 10, 3);
    expect(lines).toEqual(["Supercali…"]);
    expect(lines[0]!.length).toBeLessThanOrEqual(10);
  });
});
