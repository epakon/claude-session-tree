import type { TreeData } from "./tree.js";

export const DATA_PLACEHOLDER = '"__SESSION_TREE_DATA__"';

/** Embeds tree data into the viewer template, escaped so the JSON can't close the script tag. */
export function renderViewer(template: string, data: TreeData): string {
  if (!template.includes(DATA_PLACEHOLDER)) throw new Error("viewer template has no data placeholder");
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return template.replace(DATA_PLACEHOLDER, () => json);
}
