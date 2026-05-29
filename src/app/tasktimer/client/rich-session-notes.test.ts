import { describe, expect, it } from "vitest";
import {
  plainTextToRichNoteHtml,
  richNoteHasMeaningfulText,
  richNoteToolbarHtml,
  richNotePlainText,
  sanitizeRichNoteHtml,
  syncRichNoteToolbarState,
} from "./rich-session-notes";

function toolbarButton(command: string) {
  const attrs = new Map<string, string>();
  return {
    dataset: { richNoteCommand: command },
    setAttribute: (name: string, value: string) => attrs.set(name, value),
    getAttribute: (name: string) => attrs.get(name) || null,
  };
}

describe("rich session notes", () => {
  it("allows basic rich note markup", () => {
    expect(
      sanitizeRichNoteHtml(
        '<p><strong>Done</strong> <em>fast</em> <u>today</u></p><ul><li>One</li></ul><a href="https://example.com">link</a>'
      )
    ).toBe(
      '<p><strong>Done</strong> <em>fast</em> <u>today</u></p><ul><li>One</li></ul><a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>'
    );
  });

  it("strips unsafe tags, attributes, and URLs", () => {
    expect(
      sanitizeRichNoteHtml(
        '<img src=x onerror=alert(1)><script>alert(1)</script><b onclick="bad()">Safe</b><a href="javascript:alert(1)">bad</a><span style="color:red">plain</span>'
      )
    ).toBe("<b>Safe</b><a>bad</a>plain");
  });

  it("converts legacy plain text and extracts readable text", () => {
    expect(plainTextToRichNoteHtml("one\ntwo")).toBe("one<br>two");
    expect(sanitizeRichNoteHtml("one\ntwo")).toBe("one<br>two");
    expect(richNotePlainText("<p>one</p><p>two</p>")).toBe("one\ntwo");
  });

  it("treats markup-only notes as empty", () => {
    expect(sanitizeRichNoteHtml("<p><br></p>")).toBe("");
    expect(richNoteHasMeaningfulText("<p><br></p>")).toBe(false);
  });

  it("renders toolbar buttons as unpressed by default", () => {
    const html = richNoteToolbarHtml("note-editor");

    expect(html.match(/aria-pressed="false"/g)).toHaveLength(6);
  });

  it("syncs pressed state from rich text command state", () => {
    const bold = toolbarButton("bold");
    const italic = toolbarButton("italic");
    const toolbar = {
      querySelectorAll: () => [bold, italic],
      ownerDocument: {},
      getAttribute: () => null,
    };
    const editor = {
      ownerDocument: {
        queryCommandState: (command: string) => command === "bold",
      },
    };

    syncRichNoteToolbarState(toolbar as unknown as HTMLElement, editor as unknown as HTMLElement);

    expect(bold.getAttribute("aria-pressed")).toBe("true");
    expect(italic.getAttribute("aria-pressed")).toBe("false");
  });

  it("syncs the link button as pressed when selection is inside an anchor", () => {
    const link = toolbarButton("createLink");
    const toolbar = {
      querySelectorAll: () => [link],
      ownerDocument: {},
      getAttribute: () => null,
    };
    const editor = { nodeType: 1 };
    const anchor = { nodeType: 1, tagName: "A", parentNode: editor };
    const textNode = { nodeType: 3, parentNode: anchor };
    const doc = {
      getSelection: () => ({ anchorNode: textNode }),
    };
    Object.assign(editor, { ownerDocument: doc });

    syncRichNoteToolbarState(toolbar as unknown as HTMLElement, editor as unknown as HTMLElement);

    expect(link.getAttribute("aria-pressed")).toBe("true");
  });
});
