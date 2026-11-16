/** Pure layout helpers for the tree viewer. The build inlines this file into the viewer page as the global `SessionTreeLayout`. */

export interface LayoutInput {
  /** Ids of the top-level conversations, left to right. */
  roots: readonly string[];
  /** Child ids of each node, left to right. */
  childrenOf: ReadonlyMap<string, readonly string[]>;
  /** Nodes whose branch is folded: they are placed, their descendants are not. */
  folded: ReadonlySet<string>;
  nodeWidth: number;
  nodeHeight: number;
  /** Horizontal gap between sibling subtrees. */
  gapX: number;
  /** Vertical gap between a parent and its children. */
  gapY: number;
}

export interface Point {
  /** Horizontal centre of the node. */
  cx: number;
  /** Vertical centre of the node. */
  cy: number;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A top-down tidy tree: children sit side by side below their parent, and the parent is centred over its first and last child.
 * Separate trees are placed next to each other. A node reached twice (a corrupt registry) is placed once.
 */
export function computeLayout(input: LayoutInput): Map<string, Point> {
  const { roots, childrenOf, folded, nodeWidth, nodeHeight, gapX, gapY } = input;
  const positions = new Map<string, Point>();
  const widths = new Map<string, number>();
  const seen = new Set<string>();

  const visibleChildren = (id: string): string[] => (folded.has(id) ? [] : (childrenOf.get(id) ?? []).filter((kid) => !seen.has(kid)));

  const measure = (id: string): number => {
    seen.add(id);
    const kids = visibleChildren(id);
    const width = kids.length
      ? Math.max(nodeWidth, kids.reduce((sum, kid) => sum + measure(kid), 0) + gapX * (kids.length - 1))
      : nodeWidth;
    widths.set(id, width);
    return width;
  };

  const place = (id: string, left: number, depth: number, placed: Set<string>): void => {
    placed.add(id);
    const kids = (folded.has(id) ? [] : (childrenOf.get(id) ?? [])).filter((kid) => widths.has(kid) && !placed.has(kid));
    const centres: number[] = [];
    let x = left;
    for (const kid of kids) {
      place(kid, x, depth + 1, placed);
      centres.push(positions.get(kid)!.cx);
      x += widths.get(kid)! + gapX;
    }
    const cx = centres.length ? (centres[0]! + centres[centres.length - 1]!) / 2 : left + widths.get(id)! / 2;
    positions.set(id, { cx, cy: depth * (nodeHeight + gapY) + nodeHeight / 2 });
  };

  let left = 0;
  const placed = new Set<string>();
  for (const root of roots) {
    if (seen.has(root)) continue;
    measure(root);
    place(root, left, 0, placed);
    left += widths.get(root)! + gapX * 2;
  }
  return positions;
}

/** The rectangle that contains every placed node, or null when nothing is placed. */
export function boundsOf(positions: ReadonlyMap<string, Point>, nodeWidth: number, nodeHeight: number): Bounds | null {
  if (positions.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { cx, cy } of positions.values()) {
    minX = Math.min(minX, cx - nodeWidth / 2);
    maxX = Math.max(maxX, cx + nodeWidth / 2);
    minY = Math.min(minY, cy - nodeHeight / 2);
    maxY = Math.max(maxY, cy + nodeHeight / 2);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** How many nodes a folded branch hides. */
export function descendantCount(childrenOf: ReadonlyMap<string, readonly string[]>, id: string, seen = new Set<string>()): number {
  seen.add(id);
  let count = 0;
  for (const kid of childrenOf.get(id) ?? []) {
    if (seen.has(kid)) continue;
    count += 1 + descendantCount(childrenOf, kid, seen);
  }
  return count;
}

/** Splits text into at most `maxLines` lines of about `maxChars` characters; a cut-off text ends with an ellipsis. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  // A single word longer than a line is cut so it cannot overflow its box.
  const fitted = lines.map((entry) => (entry.length > maxChars ? `${entry.slice(0, maxChars - 1)}…` : entry));
  if (fitted.length <= maxLines) return fitted;
  const kept = fitted.slice(0, maxLines);
  const last = kept[maxLines - 1]!;
  kept[maxLines - 1] = `${last.length >= maxChars ? last.slice(0, maxChars - 1) : last}…`;
  return kept;
}
