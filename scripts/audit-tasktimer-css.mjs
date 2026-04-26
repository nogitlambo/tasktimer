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
const responsiveOwnershipPattern =
  /\.appBrandLandingReplica|(?:^|[\s>])\.modal(?:$|[\s:.[#>])|#(?:editOverlay|addTaskOverlay) \.modal|\.mobileArchieAssistant|\.desktopRailMascot|\.dashboard(?:Grid|Card|Shell|NeonLayout|Momentum|Avg|TopRow|Title|EditActions)/;

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

function collectEmptyMediaBlocks(css, filePath) {
  const matches = [];
  const pattern = /@media[^{]+\{\s*\}/g;
  for (const match of css.matchAll(pattern)) {
    const line = css.slice(0, match.index).split(/\r?\n/).length;
    matches.push({
      file: relative(filePath),
      line,
      text: match[0].replace(/\s+/g, " ").trim(),
    });
  }
  return matches;
}

function ownerAreaForFile(file) {
  if (file.endsWith("00-base.css")) return "base";
  if (file.endsWith("01-shell.css")) return "shell";
  if (file.endsWith("02-tasks.css")) return "tasks";
  if (file.endsWith("03-dashboard.css")) return "dashboard";
  if (file.endsWith("04-overlays.css")) return "overlays";
  if (file.endsWith("05-history-manager.css")) return "history";
  if (file.endsWith("06-settings.css")) return "settings";
  if (file.endsWith("07-user-guide.css")) return "user-guide";
  if (file.endsWith("08-feedback.css")) return "feedback";
  if (file.endsWith("08-friends.css")) return "friends";
  if (file.endsWith("09-desktop-rail.css")) return "desktop-rail";
  if (file.endsWith("10-responsive.css")) return "responsive";
  if (file.endsWith("globals.css")) return "globals";
  if (file.endsWith("tasktimer.css")) return "bundle";
  return "other";
}

function isBroadResponsiveOwnershipSelector(selector) {
  if (responsiveOwnershipPattern.test(selector)) {
    return true;
  }
  return (
    /(?:^| )#app\[aria-label="TaskLaunch [^\]]+"\] \.desktopApp(?:Rail|Shell|Main)$/.test(selector) ||
    /(?:^| )#app\[aria-label="TaskLaunch [^\]]+"\] \.desktopAppRail \.dashboardRailMenu(?:Btn|IconImage)(?::[\w-]+)?$/.test(selector)
  );
}

const selectorsByKey = new Map();
const authorityComments = [];
const globalsTaskTimerSelectors = [];
const emptyMediaBlocks = [];

for (const filePath of auditFiles) {
  const css = fs.readFileSync(filePath, "utf8");
  const selectors = collectSelectors(css, filePath);
  for (const selector of selectors) {
    const entries = selectorsByKey.get(selector.selector) ?? [];
    entries.push(selector);
    selectorsByKey.set(selector.selector, entries);
  }
  authorityComments.push(...collectAuthorityComments(css, filePath));
  emptyMediaBlocks.push(...collectEmptyMediaBlocks(css, filePath));
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

const responsiveFile = "src/app/tasktimer/styles/10-responsive.css";
const duplicateSelectorsInResponsive = duplicateSelectors.filter((item) =>
  item.entries.some((entry) => entry.file === responsiveFile)
);
const duplicateOwnerAreas = new Map();
for (const item of duplicateSelectors) {
  const areas = [...new Set(item.entries.map((entry) => ownerAreaForFile(entry.file)))].sort();
  const key = areas.join(" + ");
  duplicateOwnerAreas.set(key, (duplicateOwnerAreas.get(key) ?? 0) + 1);
}
const responsiveOwnershipSelectors = [...selectorsByKey.values()]
  .flat()
  .filter((entry) => entry.file === responsiveFile && isBroadResponsiveOwnershipSelector(entry.selector))
  .sort((a, b) => a.line - b.line || a.selector.localeCompare(b.selector));

console.log("TaskTimer CSS Audit");
console.log("");
console.log(`Files scanned: ${auditFiles.length}`);
console.log(`Duplicate selectors across files: ${duplicateSelectors.length}`);
console.log(`Duplicate selectors touching 10-responsive.css: ${duplicateSelectorsInResponsive.length}`);
console.log(`Potential broad ownership selectors in 10-responsive.css: ${responsiveOwnershipSelectors.length}`);
console.log(`Empty @media blocks: ${emptyMediaBlocks.length}`);
console.log(`Authority comments flagged: ${authorityComments.length}`);
console.log(`TaskTimer selectors in globals.css: ${globalsTaskTimerSelectors.length}`);
console.log("");

if (duplicateSelectors.length > 0) {
  console.log("Duplicate selector owner areas");
  for (const [areas, count] of [...duplicateOwnerAreas.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20)) {
    console.log(`- ${areas}: ${count}`);
  }
  if (duplicateOwnerAreas.size > 20) {
    console.log(`- ... ${duplicateOwnerAreas.size - 20} more`);
  }
  console.log("");

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

if (duplicateSelectorsInResponsive.length > 0) {
  console.log("Duplicate selectors touching 10-responsive.css");
  for (const item of duplicateSelectorsInResponsive.slice(0, 80)) {
    const refs = item.entries.map((entry) => `${entry.file}:${entry.line}`).join(", ");
    console.log(`- ${item.selector}`);
    console.log(`  ${refs}`);
  }
  if (duplicateSelectorsInResponsive.length > 80) {
    console.log(`- ... ${duplicateSelectorsInResponsive.length - 80} more`);
  }
  console.log("");
}

if (responsiveOwnershipSelectors.length > 0) {
  console.log("Potential broad ownership selectors in 10-responsive.css");
  console.log("These should usually live in the owner stylesheet unless they are strictly breakpoint behavior.");
  for (const item of responsiveOwnershipSelectors.slice(0, 80)) {
    console.log(`- ${item.file}:${item.line} ${item.selector}`);
  }
  if (responsiveOwnershipSelectors.length > 80) {
    console.log(`- ... ${responsiveOwnershipSelectors.length - 80} more`);
  }
  console.log("");
}

if (emptyMediaBlocks.length > 0) {
  console.log("Empty @media blocks");
  for (const item of emptyMediaBlocks) {
    console.log(`- ${item.file}:${item.line} ${item.text}`);
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
