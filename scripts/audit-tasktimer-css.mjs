import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const srcDir = path.join(repoRoot, "src");
const taskTimerDir = path.join(srcDir, "app", "tasktimer");
const stylesDir = path.join(taskTimerDir, "styles");
const tasktimerCss = path.join(taskTimerDir, "tasktimer.css");
const globalsCss = path.join(srcDir, "app", "globals.css");

const styleFiles = fs
  .readdirSync(stylesDir)
  .filter((name) => name.endsWith(".css"))
  .sort()
  .map((name) => path.join(stylesDir, name));

const auditFiles = [tasktimerCss, globalsCss, ...styleFiles];
const authorityCommentPattern = /\b(Final|Canonical|authoritative)\b/gi;
const importantPattern = /!important\b/g;
const taskTimerGlobalPattern =
  /#app\[aria-label=|data-app-page=|desktopRail|mobileArchie|dashboard|settings|feedback|historyManager|taskLaunch|tasktimer/i;
const responsiveOwnershipPattern =
  /\.appBrandLandingReplica|(?:^|[\s>])\.modal(?:$|[\s:.[#>])|#(?:editOverlay|addTaskOverlay) \.modal|\.mobileArchieAssistant|\.desktopRailMascot|\.dashboard(?:Grid|Card|Shell|NeonLayout|Momentum|Avg|TopRow|Title|EditActions)/;

const SECTION_ALIASES = {
  duplicates: [
    "duplicate-owner-areas",
    "cross-file-duplicates",
    "same-file-duplicates",
    "responsive-duplicates",
  ],
  important: ["important"],
  orphans: ["orphan-atoms"],
};

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function walkFiles(rootDir, extensions, acc = []) {
  if (!fs.existsSync(rootDir)) return acc;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, extensions, acc);
      continue;
    }
    if (extensions.has(path.extname(entry.name))) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseFocusArgs(argv) {
  const sections = new Set();
  for (const arg of argv) {
    if (!arg.startsWith("--focus=")) continue;
    const rawValue = arg.slice("--focus=".length);
    for (const token of rawValue.split(",").map((value) => value.trim()).filter(Boolean)) {
      if (SECTION_ALIASES[token]) {
        SECTION_ALIASES[token].forEach((section) => sections.add(section));
      } else {
        sections.add(token);
      }
    }
  }
  return sections;
}

function collectCssRules(css, filePath) {
  const rules = [];
  const clean = stripComments(css);
  let buffer = "";
  let bodyBuffer = "";
  let line = 1;
  let startLine = 1;
  let stringQuote = "";
  let parenDepth = 0;
  let activeSelectors = null;

  function resetPrelude() {
    buffer = "";
    startLine = line;
  }

  function parsePrelude(prelude) {
    const normalizedPrelude = normalizeWhitespace(prelude);
    if (!normalizedPrelude || normalizedPrelude.startsWith("@")) return null;
    if (!/[#.:[a-zA-Z_*]/.test(normalizedPrelude)) return null;
    const selectors = normalizedPrelude
      .split(",")
      .map((rawSelector) => normalizeWhitespace(rawSelector))
      .filter((selector) => selector && /[#.:[a-zA-Z_*]/.test(selector))
      .filter((selector) => selector !== "from" && selector !== "to" && !/^\d+%$/.test(selector));
    return selectors.length ? selectors : null;
  }

  function flushRule() {
    if (!activeSelectors) return;
    const body = bodyBuffer.trim();
    const importantCount = (body.match(importantPattern) || []).length;
    for (const selector of activeSelectors.selectors) {
      rules.push({
        file: relative(filePath),
        line: activeSelectors.line,
        selector,
        body,
        importantCount,
      });
    }
    bodyBuffer = "";
    activeSelectors = null;
  }

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];

    if (char === "\n") {
      line += 1;
    }

    if (stringQuote) {
      if (activeSelectors) bodyBuffer += char;
      else buffer += char;
      if (char === stringQuote && clean[index - 1] !== "\\") {
        stringQuote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      if (activeSelectors) bodyBuffer += char;
      else {
        if (!buffer.trim()) startLine = line;
        buffer += char;
      }
      stringQuote = char;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      if (activeSelectors) bodyBuffer += char;
      else {
        if (!buffer.trim()) startLine = line;
        buffer += char;
      }
      continue;
    }

    if (char === ")" && parenDepth > 0) {
      parenDepth -= 1;
      if (activeSelectors) bodyBuffer += char;
      else buffer += char;
      continue;
    }

    if (activeSelectors) {
      if (char === "}") {
        flushRule();
        resetPrelude();
        continue;
      }
      bodyBuffer += char;
      continue;
    }

    if (char === "{") {
      const selectors = parsePrelude(buffer);
      if (selectors) {
        activeSelectors = { selectors, line: startLine };
        bodyBuffer = "";
      }
      resetPrelude();
      continue;
    }

    if (char === "}") {
      resetPrelude();
      continue;
    }

    if (!buffer.trim() && /\S/.test(char)) {
      startLine = line;
    }
    buffer += char;
  }

  return rules;
}

function collectAuthorityComments(css, filePath) {
  const matches = [];
  const lines = css.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    authorityCommentPattern.lastIndex = 0;
    if (!authorityCommentPattern.test(lines[index])) continue;
    matches.push({
      file: relative(filePath),
      line: index + 1,
      text: lines[index].trim(),
    });
  }
  return matches;
}

function collectEmptyMediaBlocks(css, filePath) {
  const matches = [];
  const pattern = /@media[^{]+\{\s*\}/g;
  for (const match of css.matchAll(pattern)) {
    const line = css.slice(0, match.index).split(/\r?\n/).length;
    matches.push({
      file: relative(filePath),
      line,
      text: normalizeWhitespace(match[0]),
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
  if (file.endsWith("08-feedback.css")) return "feedback";
  if (file.endsWith("08-friends.css")) return "friends";
  if (file.endsWith("09-desktop-rail.css")) return "desktop-rail";
  if (file.endsWith("10-responsive.css")) return "responsive";
  if (file.endsWith("globals.css")) return "globals";
  if (file.endsWith("tasktimer.css")) return "bundle";
  return "other";
}

function isBroadResponsiveOwnershipSelector(selector) {
  if (responsiveOwnershipPattern.test(selector)) return true;
  return (
    /(?:^| )#app\[aria-label="TaskLaunch [^\]]+"\] \.desktopApp(?:Rail|Shell|Main)$/.test(selector) ||
    /(?:^| )#app\[aria-label="TaskLaunch [^\]]+"\] \.desktopAppRail \.dashboardRailMenu(?:Btn|IconImage)(?::[\w-]+)?$/.test(selector)
  );
}

function ensureUsageBuckets(usage, kind) {
  if (!usage[kind]) usage[kind] = new Map();
  return usage[kind];
}

function noteUsage(usage, kind, name, ref) {
  if (!name) return;
  const bucket = ensureUsageBuckets(usage, kind);
  const existing = bucket.get(name) ?? [];
  existing.push(ref);
  bucket.set(name, existing);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitClassTokens(rawValue) {
  return rawValue
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !/[${}]/.test(token));
}

function collectSelectorAtoms(selector) {
  const classes = new Set();
  const ids = new Set();
  const dataAttrs = new Set();
  const dataPairs = new Set();

  for (const match of selector.matchAll(/\.([_a-zA-Z][-_a-zA-Z0-9]*)/g)) {
    classes.add(match[1]);
  }
  for (const match of selector.matchAll(/#([_a-zA-Z][-_a-zA-Z0-9]*)/g)) {
    ids.add(match[1]);
  }
  for (const match of selector.matchAll(/\[data-([a-zA-Z0-9_-]+)(?:([~|^$*]?=)(["']?)([^"'`\]]+)\3)?\]/g)) {
    const attrName = match[1];
    const attrValue = String(match[4] || "").trim();
    dataAttrs.add(attrName);
    if (attrValue) {
      dataPairs.add(`${attrName}=${attrValue}`);
    }
  }

  return { classes, ids, dataAttrs, dataPairs };
}

function collectSourceUsage(files) {
  const usage = {
    classes: new Map(),
    ids: new Map(),
    dataAttrs: new Map(),
    dataPairs: new Map(),
    corpus: "",
  };

  for (const filePath of files) {
    const rel = relative(filePath);
    const text = fs.readFileSync(filePath, "utf8");
    usage.corpus += `\n${text}`;

    for (const match of text.matchAll(/\b(?:className|class)\s*=\s*["'`]([^"'`]+)["'`]/g)) {
      for (const token of splitClassTokens(match[1])) {
        noteUsage(usage, "classes", token, `${rel}:class`);
      }
    }

    for (const match of text.matchAll(/\bid\s*=\s*["'`]([^"'`]+)["'`]/g)) {
      const token = String(match[1] || "").trim();
      if (token && !/[${}]/.test(token)) {
        noteUsage(usage, "ids", token, `${rel}:id`);
      }
    }

    for (const match of text.matchAll(/\bdata-([a-zA-Z0-9_-]+)\b/g)) {
      noteUsage(usage, "dataAttrs", match[1], `${rel}:data-attr`);
    }

    for (const match of text.matchAll(/\bdata-([a-zA-Z0-9_-]+)\s*=\s*["'`]([^"'`]+)["'`]/g)) {
      const attrName = match[1];
      const attrValue = String(match[2] || "").trim();
      if (!attrValue || /[${}]/.test(attrValue)) continue;
      noteUsage(usage, "dataPairs", `${attrName}=${attrValue}`, `${rel}:data-pair`);
    }

    for (const match of text.matchAll(/\bgetElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
      noteUsage(usage, "ids", match[1], `${rel}:getElementById`);
    }

    for (const match of text.matchAll(/\b(?:querySelector(?:All)?|closest|matches)\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
      const atoms = collectSelectorAtoms(match[1]);
      atoms.classes.forEach((token) => noteUsage(usage, "classes", token, `${rel}:selector`));
      atoms.ids.forEach((token) => noteUsage(usage, "ids", token, `${rel}:selector`));
      atoms.dataAttrs.forEach((token) => noteUsage(usage, "dataAttrs", token, `${rel}:selector`));
      atoms.dataPairs.forEach((token) => noteUsage(usage, "dataPairs", token, `${rel}:selector`));
    }

    for (const match of text.matchAll(/\bclassList\.(?:add|remove|toggle|contains)\(([^)]*)\)/g)) {
      const args = match[1].split(",").map((value) => value.trim());
      for (const arg of args) {
        const quoted = arg.match(/^["'`]([^"'`]+)["'`]$/);
        if (!quoted) continue;
        for (const token of splitClassTokens(quoted[1])) {
          noteUsage(usage, "classes", token, `${rel}:classList`);
        }
      }
    }
  }

  return usage;
}

function buildOrphanAtomReport(ruleEntries, sourceUsage) {
  const orphanAtoms = new Map();
  const tokenPresenceCache = new Map();

  function hasSourceUsage(kind, token) {
    const cacheKey = `${kind}:${token}`;
    if (tokenPresenceCache.has(cacheKey)) return tokenPresenceCache.get(cacheKey);

    let result = false;
    if (kind === "class") {
      result =
        sourceUsage.classes.has(token) ||
        new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(token)}([^A-Za-z0-9_-]|$)`).test(sourceUsage.corpus);
    } else if (kind === "id") {
      result =
        sourceUsage.ids.has(token) ||
        new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(token)}([^A-Za-z0-9_-]|$)`).test(sourceUsage.corpus);
    } else if (kind === "data-attr") {
      result =
        sourceUsage.dataAttrs.has(token) ||
        new RegExp(`\\bdata-${escapeRegExp(token)}\\b`).test(sourceUsage.corpus);
    } else if (kind === "data-pair") {
      const [attrName, ...valueParts] = token.split("=");
      const attrValue = valueParts.join("=");
      result =
        sourceUsage.dataPairs.has(token) ||
        new RegExp(`\\bdata-${escapeRegExp(attrName)}\\s*=\\s*["'\`]${escapeRegExp(attrValue)}["'\`]`).test(sourceUsage.corpus);
    }

    tokenPresenceCache.set(cacheKey, result);
    return result;
  }

  function noteOrphan(kind, token, entry) {
    const key = `${kind}:${token}`;
    const existing = orphanAtoms.get(key) ?? {
      kind,
      token,
      refs: [],
    };
    existing.refs.push({
      file: entry.file,
      line: entry.line,
      selector: entry.selector,
    });
    orphanAtoms.set(key, existing);
  }

  for (const entry of ruleEntries) {
    if (!entry.file.startsWith("src/app/tasktimer/styles/")) continue;
    const atoms = collectSelectorAtoms(entry.selector);

    for (const token of atoms.classes) {
      if (hasSourceUsage("class", token)) continue;
      noteOrphan("class", token, entry);
    }

    for (const token of atoms.ids) {
      if (hasSourceUsage("id", token)) continue;
      noteOrphan("id", token, entry);
    }

    for (const token of atoms.dataAttrs) {
      if (hasSourceUsage("data-attr", token)) continue;
      noteOrphan("data-attr", token, entry);
    }

    for (const token of atoms.dataPairs) {
      if (hasSourceUsage("data-pair", token)) continue;
      noteOrphan("data-pair", token, entry);
    }
  }

  return [...orphanAtoms.values()]
    .map((entry) => ({
      ...entry,
      refs: entry.refs
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.selector.localeCompare(b.selector))
        .filter((ref, index, refs) => index === 0 || ref.file !== refs[index - 1].file || ref.line !== refs[index - 1].line || ref.selector !== refs[index - 1].selector),
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.token.localeCompare(b.token));
}

function printSection(title, printer) {
  console.log(title);
  printer();
  console.log("");
}

const focusSections = parseFocusArgs(process.argv.slice(2));
const shouldPrint = (section) => focusSections.size === 0 || focusSections.has(section);

const ruleEntries = [];
const selectorsByKey = new Map();
const selectorsByFile = new Map();
const authorityComments = [];
const globalsTaskTimerSelectors = [];
const emptyMediaBlocks = [];
const importantByFile = [];

for (const filePath of auditFiles) {
  const css = fs.readFileSync(filePath, "utf8");
  const file = relative(filePath);
  const rules = collectCssRules(css, filePath);
  const fileImportantCount = (css.match(importantPattern) || []).length;
  importantByFile.push({
    file,
    importantCount: fileImportantCount,
    lineCount: css.split(/\r?\n/).length,
  });

  for (const rule of rules) {
    ruleEntries.push(rule);
    const sharedEntries = selectorsByKey.get(rule.selector) ?? [];
    sharedEntries.push({ file: rule.file, line: rule.line, selector: rule.selector });
    selectorsByKey.set(rule.selector, sharedEntries);

    const fileSelectors = selectorsByFile.get(rule.file) ?? new Map();
    const repeatedEntries = fileSelectors.get(rule.selector) ?? [];
    repeatedEntries.push({ file: rule.file, line: rule.line, selector: rule.selector });
    fileSelectors.set(rule.selector, repeatedEntries);
    selectorsByFile.set(rule.file, fileSelectors);
  }

  authorityComments.push(...collectAuthorityComments(css, filePath));
  emptyMediaBlocks.push(...collectEmptyMediaBlocks(css, filePath));
  if (filePath === globalsCss) {
    globalsTaskTimerSelectors.push(...rules.filter((entry) => taskTimerGlobalPattern.test(entry.selector)));
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

const sameFileDuplicates = [...selectorsByFile.entries()]
  .map(([file, selectorMap]) => {
    const duplicates = [...selectorMap.entries()]
      .filter(([, entries]) => entries.length > 1)
      .map(([selector, entries]) => ({ selector, entries }))
      .sort((a, b) => b.entries.length - a.entries.length || a.selector.localeCompare(b.selector));
    return { file, duplicates };
  })
  .filter((entry) => entry.duplicates.length > 0)
  .sort((a, b) => b.duplicates.length - a.duplicates.length || a.file.localeCompare(b.file));

const importantHotspots = ruleEntries
  .filter((entry) => entry.importantCount > 0)
  .sort((a, b) => b.importantCount - a.importantCount || a.file.localeCompare(b.file) || a.line - b.line);

const sourceFiles = walkFiles(srcDir, new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]));
const sourceUsage = collectSourceUsage(sourceFiles);
const orphanAtoms = buildOrphanAtomReport(ruleEntries, sourceUsage);
const orphanCountsByKind = orphanAtoms.reduce((acc, entry) => {
  acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
  return acc;
}, {});
const sameFileDuplicateFamilies = sameFileDuplicates.reduce((sum, entry) => sum + entry.duplicates.length, 0);

console.log("TaskTimer CSS Audit");
console.log("");
console.log(`Files scanned: ${auditFiles.length}`);
console.log(`Source files scanned for selector hooks: ${sourceFiles.length}`);
console.log(`Duplicate selectors across files: ${duplicateSelectors.length}`);
console.log(`Duplicate selector families within a file: ${sameFileDuplicateFamilies}`);
console.log(`Duplicate selectors touching 10-responsive.css: ${duplicateSelectorsInResponsive.length}`);
console.log(`Potential broad ownership selectors in 10-responsive.css: ${responsiveOwnershipSelectors.length}`);
console.log(`Rule blocks using !important: ${importantHotspots.length}`);
console.log(`Total !important usages: ${importantByFile.reduce((sum, item) => sum + item.importantCount, 0)}`);
console.log(`Likely orphaned selector atoms: ${orphanAtoms.length}`);
console.log(`Empty @media blocks: ${emptyMediaBlocks.length}`);
console.log(`Authority comments flagged: ${authorityComments.length}`);
console.log(`TaskTimer selectors in globals.css: ${globalsTaskTimerSelectors.length}`);
console.log("");

if (shouldPrint("duplicate-owner-areas") && duplicateSelectors.length > 0) {
  printSection("Duplicate selector owner areas", () => {
    for (const [areas, count] of [...duplicateOwnerAreas.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20)) {
      console.log(`- ${areas}: ${count}`);
    }
    if (duplicateOwnerAreas.size > 20) {
      console.log(`- ... ${duplicateOwnerAreas.size - 20} more`);
    }
  });
}

if (shouldPrint("cross-file-duplicates") && duplicateSelectors.length > 0) {
  printSection("Duplicate selectors across files", () => {
    for (const item of duplicateSelectors.slice(0, 80)) {
      const refs = item.entries.map((entry) => `${entry.file}:${entry.line}`).join(", ");
      console.log(`- ${item.selector}`);
      console.log(`  ${refs}`);
    }
    if (duplicateSelectors.length > 80) {
      console.log(`- ... ${duplicateSelectors.length - 80} more`);
    }
  });
}

if (shouldPrint("responsive-duplicates") && duplicateSelectorsInResponsive.length > 0) {
  printSection("Duplicate selectors touching 10-responsive.css", () => {
    for (const item of duplicateSelectorsInResponsive.slice(0, 80)) {
      const refs = item.entries.map((entry) => `${entry.file}:${entry.line}`).join(", ");
      console.log(`- ${item.selector}`);
      console.log(`  ${refs}`);
    }
    if (duplicateSelectorsInResponsive.length > 80) {
      console.log(`- ... ${duplicateSelectorsInResponsive.length - 80} more`);
    }
  });
}

if (shouldPrint("responsive-ownership") && responsiveOwnershipSelectors.length > 0) {
  printSection("Potential broad ownership selectors in 10-responsive.css", () => {
    console.log("These should usually live in the owner stylesheet unless they are strictly breakpoint behavior.");
    for (const item of responsiveOwnershipSelectors.slice(0, 80)) {
      console.log(`- ${item.file}:${item.line} ${item.selector}`);
    }
    if (responsiveOwnershipSelectors.length > 80) {
      console.log(`- ... ${responsiveOwnershipSelectors.length - 80} more`);
    }
  });
}

if (shouldPrint("same-file-duplicates") && sameFileDuplicates.length > 0) {
  printSection("Duplicate selector families within the same file", () => {
    for (const fileEntry of sameFileDuplicates.slice(0, 12)) {
      console.log(`- ${fileEntry.file}: ${fileEntry.duplicates.length}`);
      for (const duplicate of fileEntry.duplicates.slice(0, 6)) {
        console.log(`  ${duplicate.entries.length}x ${duplicate.selector}`);
        console.log(`    ${duplicate.entries.map((entry) => `${entry.file}:${entry.line}`).join(", ")}`);
      }
      if (fileEntry.duplicates.length > 6) {
        console.log(`  ... ${fileEntry.duplicates.length - 6} more`);
      }
    }
    if (sameFileDuplicates.length > 12) {
      console.log(`- ... ${sameFileDuplicates.length - 12} more files`);
    }
  });
}

if (shouldPrint("important") && importantHotspots.length > 0) {
  printSection("!important hotspots", () => {
    console.log("By file");
    for (const item of importantByFile.slice().sort((a, b) => b.importantCount - a.importantCount || a.file.localeCompare(b.file)).slice(0, 15)) {
      console.log(`- ${item.file}: ${item.importantCount} !important across ${item.lineCount} lines`);
    }
    console.log("");
    console.log("By selector block");
    for (const item of importantHotspots.slice(0, 40)) {
      console.log(`- ${item.file}:${item.line} ${item.selector} (${item.importantCount})`);
    }
    if (importantHotspots.length > 40) {
      console.log(`- ... ${importantHotspots.length - 40} more`);
    }
  });
}

if (shouldPrint("orphan-atoms") && orphanAtoms.length > 0) {
  printSection("Likely orphaned selector atoms", () => {
    console.log("Heuristic only: these class/id/data atoms were found in TaskTimer CSS but not in scanned source hooks.");
    for (const [kind, count] of Object.entries(orphanCountsByKind).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      console.log(`- ${kind}: ${count}`);
    }
    console.log("");
    for (const item of orphanAtoms.slice(0, 80)) {
      console.log(`- ${item.kind} ${item.token}`);
      console.log(`  ${item.refs.slice(0, 4).map((ref) => `${ref.file}:${ref.line} ${ref.selector}`).join(" | ")}`);
      if (item.refs.length > 4) {
        console.log(`  ... ${item.refs.length - 4} more`);
      }
    }
    if (orphanAtoms.length > 80) {
      console.log(`- ... ${orphanAtoms.length - 80} more`);
    }
  });
}

if (shouldPrint("empty-media") && emptyMediaBlocks.length > 0) {
  printSection("Empty @media blocks", () => {
    for (const item of emptyMediaBlocks) {
      console.log(`- ${item.file}:${item.line} ${item.text}`);
    }
  });
}

if (shouldPrint("authority-comments") && authorityComments.length > 0) {
  printSection("Authority comments", () => {
    for (const item of authorityComments) {
      console.log(`- ${item.file}:${item.line} ${item.text}`);
    }
  });
}

if (shouldPrint("globals") && globalsTaskTimerSelectors.length > 0) {
  printSection("TaskTimer selectors in globals.css", () => {
    for (const item of globalsTaskTimerSelectors) {
      console.log(`- ${item.file}:${item.line} ${item.selector}`);
    }
  });
}
