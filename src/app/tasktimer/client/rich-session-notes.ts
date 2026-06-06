const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div", "a"]);
const BLOCK_TAGS = new Set(["p", "div", "ul", "ol", "li"]);
const SAFE_URL_RE = /^(https?:|mailto:|tel:|\/(?!\/)|#)/i;

type ValueBackedElement = HTMLElement & { value?: string };
const STATEFUL_TOOLBAR_COMMANDS = new Set(["bold", "italic", "underline", "insertUnorderedList", "insertOrderedList"]);

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function escapeCssAttributeValue(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeWhitespaceHtml(html: string) {
  return html
    .replace(/\r\n?/g, "\n")
    .trim();
}

function sanitizeAttributes(tagName: string, rawAttrs: string) {
  if (tagName !== "a") return "";
  const hrefMatch = rawAttrs.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  const href = decodeBasicEntities(String(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "")).trim();
  if (!href || !SAFE_URL_RE.test(href)) return "";
  return ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"`;
}

export function richNotePlainText(value: unknown) {
  return decodeBasicEntities(
    String(value ?? "")
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*\/(p|div|li)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
  ).trim();
}

export function richNoteHasMeaningfulText(value: unknown) {
  return !!richNotePlainText(value);
}

export function plainTextToRichNoteHtml(value: unknown) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return "";
  return escapeHtml(text).replace(/\n/g, "<br>");
}

export function sanitizeRichNoteHtml(value: unknown) {
  const raw = normalizeWhitespaceHtml(String(value ?? ""));
  if (!raw) return "";
  const source = /<[^>]+>/.test(raw) ? raw : plainTextToRichNoteHtml(raw);
  const withoutUnsafeBlocks = source.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  let output = "";
  let cursor = 0;
  const tagRe = /<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(withoutUnsafeBlocks))) {
    output += escapeHtml(withoutUnsafeBlocks.slice(cursor, match.index));
    cursor = tagRe.lastIndex;
    const closing = !!match[1];
    const tagName = String(match[2] || "").toLowerCase();
    const attrs = String(match[3] || "");
    if (!ALLOWED_TAGS.has(tagName)) continue;
    if (tagName === "br") {
      if (!closing) output += "<br>";
      continue;
    }
    if (closing) {
      output += `</${tagName}>`;
      continue;
    }
    output += `<${tagName}${sanitizeAttributes(tagName, attrs)}>`;
  }
  output += escapeHtml(withoutUnsafeBlocks.slice(cursor));
  const normalized = normalizeWhitespaceHtml(output)
    .replace(/<(p|div)><\/\1>/gi, "")
    .replace(/<a(?:\s[^>]*)?><\/a>/gi, "");
  return richNoteHasMeaningfulText(normalized) ? normalized : "";
}

export function prepareRichNoteForDisplay(value: unknown) {
  return sanitizeRichNoteHtml(value);
}

export function getRichNoteEditorValue(editor: HTMLElement | null | undefined) {
  const valueBackedEditor = editor as ValueBackedElement | null | undefined;
  const value = editor?.innerHTML || valueBackedEditor?.value || "";
  return sanitizeRichNoteHtml(value);
}

export function setRichNoteEditorValue(editor: HTMLElement | null | undefined, value: unknown) {
  if (!editor) return;
  const nextValue = sanitizeRichNoteHtml(value);
  editor.innerHTML = nextValue;
  if ("value" in editor) {
    try {
      (editor as ValueBackedElement).value = nextValue;
    } catch {
      // ignore read-only test doubles
    }
  }
}

export function insertPlainTextIntoRichNoteEditor(editor: HTMLElement, text: string) {
  const doc = editor.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!doc) {
    editor.textContent = `${editor.textContent || ""}${text}`;
    return;
  }
  if (typeof doc.execCommand === "function") {
    doc.execCommand("insertText", false, text);
    return;
  }
  editor.textContent = `${editor.textContent || ""}${text}`;
}

export function handleRichNotePaste(event: ClipboardEvent) {
  const target = event.target as HTMLElement | null;
  const editor = target?.closest?.("[data-rich-note-editor]") as HTMLElement | null;
  if (!editor) return;
  event.preventDefault();
  const clipboard = event.clipboardData;
  const html = clipboard?.getData("text/html") || "";
  const text = clipboard?.getData("text/plain") || "";
  if (html) {
    const sanitized = sanitizeRichNoteHtml(html);
    const doc = editor.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (doc && typeof doc.execCommand === "function") doc.execCommand("insertHTML", false, sanitized);
    else editor.innerHTML += sanitized;
    return;
  }
  insertPlainTextIntoRichNoteEditor(editor, text);
}

export function handleRichNoteToolbarClick(event: Event) {
  const button = (event.target as HTMLElement | null)?.closest?.("[data-rich-note-command]") as HTMLButtonElement | null;
  if (!button) return false;
  const toolbar = button.closest("[data-rich-note-toolbar]") as HTMLElement | null;
  const editorId = toolbar?.getAttribute("data-rich-note-for") || "";
  const editor = editorId
    ? (button.ownerDocument.getElementById(editorId) as HTMLElement | null)
    : (toolbar?.parentElement?.querySelector("[data-rich-note-editor]") as HTMLElement | null);
  if (!editor) return false;
  event.preventDefault();
  editor.focus();
  const command = String(button.dataset.richNoteCommand || "");
  if (command === "attachFiles") {
    toolbar?.dispatchEvent(new CustomEvent("richnote:attach-files", {
      bubbles: true,
      detail: { editorId, editor },
    }));
    syncRichNoteToolbarState(toolbar, editor);
    return true;
  }
  const doc = editor.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!doc || typeof doc.execCommand !== "function") return true;
  if (command === "createLink") {
    const href = window.prompt("Link URL");
    if (!href || !SAFE_URL_RE.test(href.trim())) {
      syncRichNoteToolbarState(toolbar, editor);
      return true;
    }
    doc.execCommand("createLink", false, href.trim());
  } else {
    doc.execCommand(command, false);
  }
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  syncRichNoteToolbarState(toolbar, editor);
  return true;
}

function resolveRichNoteEditor(toolbar: HTMLElement | null | undefined) {
  const editorId = toolbar?.getAttribute("data-rich-note-for") || "";
  if (editorId) return toolbar?.ownerDocument.getElementById(editorId) as HTMLElement | null;
  return (toolbar?.parentElement?.querySelector("[data-rich-note-editor]") as HTMLElement | null) || null;
}

function selectionIsInsideLink(editor: HTMLElement, doc: Document) {
  const selection = typeof doc.getSelection === "function" ? doc.getSelection() : null;
  const anchorNode = selection?.anchorNode || null;
  let node: Node | null = anchorNode;
  while (node && node !== editor) {
    if (node.nodeType === 1 && (node as Element).tagName.toLowerCase() === "a") return true;
    node = node.parentNode;
  }
  return false;
}

export function syncRichNoteToolbarState(toolbar: HTMLElement | null | undefined, editorOverride?: HTMLElement | null) {
  if (!toolbar) return false;
  const editor = editorOverride || resolveRichNoteEditor(toolbar);
  const doc = editor?.ownerDocument || toolbar.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!editor || !doc) return false;
  toolbar.querySelectorAll<HTMLButtonElement>("[data-rich-note-command]").forEach((button) => {
    const command = String(button.dataset.richNoteCommand || "");
    let isPressed = false;
    if (command === "createLink") {
      isPressed = selectionIsInsideLink(editor, doc);
    } else if (STATEFUL_TOOLBAR_COMMANDS.has(command) && typeof doc.queryCommandState === "function") {
      try {
        isPressed = !!doc.queryCommandState(command);
      } catch {
        isPressed = false;
      }
    }
    button.setAttribute("aria-pressed", isPressed ? "true" : "false");
  });
  return true;
}

export function syncRichNoteToolbarStates(root?: ParentNode | null) {
  const scope = root || (typeof document !== "undefined" ? document : null);
  if (!scope) return;
  scope.querySelectorAll<HTMLElement>("[data-rich-note-toolbar]").forEach((toolbar) => syncRichNoteToolbarState(toolbar));
}

export function handleRichNoteToolbarStateEvent(event: Event) {
  const target = event.target as HTMLElement | null;
  const editor = target?.closest?.("[data-rich-note-editor]") as HTMLElement | null;
  const toolbar = target?.closest?.("[data-rich-note-toolbar]") as HTMLElement | null;
  if (toolbar) {
    syncRichNoteToolbarState(toolbar);
    return;
  }
  if (!editor) return;
  const editorId = editor.id;
  const ownerDocument = editor.ownerDocument || (typeof document !== "undefined" ? document : null);
  const parentToolbar = editor.parentElement?.querySelector<HTMLElement>("[data-rich-note-toolbar]");
  if (parentToolbar) syncRichNoteToolbarState(parentToolbar, editor);
  if (editorId && ownerDocument) {
    ownerDocument
      .querySelectorAll<HTMLElement>(`[data-rich-note-toolbar][data-rich-note-for="${escapeCssAttributeValue(editorId)}"]`)
      .forEach((matchingToolbar) => syncRichNoteToolbarState(matchingToolbar, editor));
  }
}

export function richNoteToolbarHtml(editorId: string) {
  const buttons = [
    { command: "bold", label: "B", title: "Bold" },
    { command: "italic", label: "I", title: "Italic" },
    { command: "underline", label: "U", title: "Underline" },
    { command: "insertUnorderedList", icon: "/icons/list.png", title: "Bulleted list" },
    { command: "insertOrderedList", icon: "/icons/numbered_list.png", title: "Numbered list" },
    { command: "createLink", icon: "/icons/link.png", title: "Add link" },
    { command: "attachFiles", label: "Attach File(s)", title: "Attach File(s)" },
  ];
  return `<div class="richNoteToolbar" role="toolbar" aria-label="Session note formatting" data-rich-note-toolbar="true" data-rich-note-for="${escapeHtml(editorId)}">${buttons
    .map(
      (button) =>
        `<button class="btn btn-ghost small richNoteToolbarBtn" type="button" title="${escapeHtml(button.title)}" aria-label="${escapeHtml(button.title)}" data-rich-note-command="${escapeHtml(button.command)}" aria-pressed="false">${button.icon ? `<img class="richNoteToolbarIcon" src="${escapeHtml(button.icon)}" alt="" aria-hidden="true" />` : escapeHtml(button.label)}</button>`
    )
    .join("")}</div>`;
}

export function stripUnsupportedBlockPadding(html: string) {
  return sanitizeRichNoteHtml(html).replace(/<\/?div>/gi, (tag) => (BLOCK_TAGS.has("div") ? tag : ""));
}
