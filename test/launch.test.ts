import { describe, expect, it } from "vitest";
import { insideCursor } from "../src/launch.js";

describe("insideCursor", () => {
  it("recognises Cursor by the path of its git helper", () => {
    expect(insideCursor({ VSCODE_GIT_ASKPASS_NODE: "/Users/x/Soft/Cursor.app/Contents/Frameworks/Cursor Helper (Plugin).app/Contents/MacOS/Cursor Helper (Plugin)" })).toBe(true);
    expect(insideCursor({ VSCODE_GIT_ASKPASS_NODE: "C:\\Users\\x\\AppData\\Local\\Programs\\Cursor\\Cursor.exe" })).toBe(true);
  });
  it("treats VS Code and an unknown terminal as not Cursor", () => {
    expect(insideCursor({ VSCODE_GIT_ASKPASS_NODE: "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)" })).toBe(false);
    expect(insideCursor({})).toBe(false);
  });
});
