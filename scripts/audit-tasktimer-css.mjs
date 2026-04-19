import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const stylesDir = path.join(repoRoot, "src", "app", "tasktimer", "styles");
const tasktimerCss = path.join(repoRoot, "src", "app", "tasktimer", "tasktimer.css");
const globalsCss = path.join(repoRoot, "src", "app", "globals.css");

const styleFiles = fs
  .readdirSync(stylesDir)
  .filter((name) => name.endsWith(".css"))
  .sort()
  .map((name) => path.join(stylesDir, name));

const auditFiles = [tasktimerCss, globalsCss, ...styleFiles];
const authorityCommentPattern = /\b(Final|Canonical|authoritative)\b/gi;
const taskTimerGlobalPattern =
  /#app\[aria-label=|data-app-page=|desktopRail|mobileArchie|dashboard|settings|feedback|historyManager|taskLaunch|tasktimer/i;

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function collectSelectors(css, filePath) {
  const selectors = [];
  const clean = stripComments(css);
  let buffer = "";
  let line = 1;
  let startLine = 1;
  let stringQuote = "";
  let parenDepth = 0;

  function resetBuffer() {
    buffer = "";
    startLine = line;
  }

  function maybeRecordPrelude(prelude) {
    const normalizedPrelude = prelude.replace(/\s+/g, " ").trim();
    if (!normalizedPrelude || normalizedPrelude.startsWith("@")) {
      return;
    }
    if (!/[#.:[a-zA-Z_*]/.test(normalizedPrelude)) {
      return;
    }
    for (const rawSelector of normalizedPrelude.split(",")) {
      const selector = rawSelector.replace(/\s+/g, " ").trim();
      if (!selector || !/[#.:[a-zA-Z_*]/.test(selector)) {
        continue;
      }
      if (selector === "from" || selector === "to" || /^\d+%$/.test(selector)) {
        continue;
      }
      selectors.push({
        file: relative(filePath),
        line: startLine,
        selector,
      });
    }
  }

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];

    if (char === "\n") {
      line += 1;
    }

    if (stringQuote) {
      buffer += char;
      if (char === stringQuote && clean[index - 1] !== "\\") {
        stringQuote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      if (!buffer.trim()) {
        startLine = line;
      }
      buffer += char;
      stringQuote = char;
      continue;
    }

    if (char === "(") {
      if (!buffer.trim()) {
        startLine = line;
      }
      parenDepth += 1;
      buffer += char;
      continue;
    }

    if (char === ")" && parenDepth > 0) {
      parenDepth -= 1;
      buffer += char;
      continue;
    }

    if (char === "{") {
      maybeRecordPrelude(buffer);
      resetBuffer();
      continue;
    }

    if (char === "}") {
      resetBuffer();
      continue;
    }

    if (!buffer.trim() && /\S/.test(char)) {
      startLine = line;
    }

    buffer += char;
  }

  return selectors;
}

function collectAuthorityComments(css, filePath) {
  const matches = [];
  const lines = css.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    authorityCommentPattern.lastIndex = 0;
    if (!authorityCommentPattern.test(lines[index])) {
      continue;
    }
    matches.push({
      file: relative(filePath),
      line: index + 1,
      text: lines[index].trim(),
    });
  }
  return matches;
}

function collectGlobalsTaskTimerSelectors(css, filePath) {
  return collectSelectors(css, filePath).filter((entry) => taskTimerGlobalPattern.test(entry.selector));
}

const selectorsByKey = new Map();
const authorityComments = [];
const globalsTaskTimerSelectors = [];

for (const filePath of auditFiles) {
  const css = fs.readFileSync(filePath, "utf8");
  const selectors = collectSelectors(css, filePath);
  for (const selector of selectors) {
    const entries = selectorsByKey.get(selector.selector) ?? [];
    entries.push(selector);
    selectorsByKey.set(selector.selector, entries);
  }
  authorityComments.push(...collectAuthorityComments(css, filePath));
  if (filePath === globalsCss) {
    globalsTaskTimerSelectors.push(...collectGlobalsTaskTimerSelectors(css, filePath));
  }
}

const duplicateSelectors = [...selectorsByKey.entries()]
  .map(([selector, entries]) => ({
    selector,
    entries,
    files: new Set(entries.map((entry) => entry.file)),
  }))
  .filter((entry) => entry.files.size > 1)
  .sort((a, b) => b.files.size - a.files.size || a.selector.localeCompare(b.selector));

console.log("TaskTimer CSS Audit");
console.log("");
console.log(`Files scanned: ${auditFiles.length}`);
console.log(`Duplicate selectors across files: ${duplicateSelectors.length}`);
console.log(`Authority comments flagged: ${authorityComments.length}`);
console.log(`TaskTimer selectors in globals.css: ${globalsTaskTimerSelectors.length}`);
console.log("");

if (duplicateSelectors.length > 0) {
  console.log("Duplicate selectors");
  for (const item of duplicateSelectors.slice(0, 80)) {
    const refs = item.entries.map((entry) => `${entry.file}:${entry.line}`).join(", ");
    console.log(`- ${item.selector}`);
    console.log(`  ${refs}`);
  }
  if (duplicateSelectors.length > 80) {
    console.log(`- ... ${duplicateSelectors.length - 80} more`);
  }
  console.log("");
}

if (authorityComments.length > 0) {
  console.log("Authority comments");
  for (const item of authorityComments) {
    console.log(`- ${item.file}:${item.line} ${item.text}`);
  }
  console.log("");
}

if (globalsTaskTimerSelectors.length > 0) {
  console.log("TaskTimer selectors in globals.css");
  for (const item of globalsTaskTimerSelectors) {
    console.log(`- ${item.file}:${item.line} ${item.selector}`);
  }
  console.log("");
}
