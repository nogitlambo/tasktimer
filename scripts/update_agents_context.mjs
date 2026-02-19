import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const AGENTS_PATH = path.join(ROOT, "AGENTS.md");
const TASKTIMER_ROOT = path.join(ROOT, "src", "app", "tasktimer");
const CLIENT_PATH = path.join(TASKTIMER_ROOT, "tasktimerClient.ts");
const STORAGE_PATH = path.join(TASKTIMER_ROOT, "lib", "storage.ts");

const START_MARKER = "<!-- AUTO-CONTEXT:START -->";
const END_MARKER = "<!-- AUTO-CONTEXT:END -->";

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function getRoutes() {
  const pages = walk(TASKTIMER_ROOT)
    .filter((p) => p.endsWith(`${path.sep}page.tsx`) || p.endsWith(`${path.sep}page.ts`))
    .map((p) => rel(p));

  const routes = pages.map((p) => {
    const dir = p.replace(/^src\/app\//, "").replace(/\/page\.tsx?$/, "");
    return `/${dir}`;
  });

  return uniqueSorted(routes);
}

function getStorageKeys() {
  const keys = [];
  if (fs.existsSync(STORAGE_PATH)) {
    const content = fs.readFileSync(STORAGE_PATH, "utf8");
    const m = content.match(/export const STORAGE_KEY\s*=\s*["'`]([^"'`]+)["'`]/);
    if (m) keys.push(`STORAGE_KEY = "${m[1]}"`);
  }
  if (fs.existsSync(CLIENT_PATH)) {
    const content = fs.readFileSync(CLIENT_PATH, "utf8");
    for (const m of content.matchAll(/const\s+([A-Z0-9_]+_KEY)\s*=\s*`([^`]+)`/g)) {
      keys.push(`${m[1]} = \`${m[2]}\``);
    }
  }
  return uniqueSorted(keys);
}

function getDataHooks() {
  const files = [
    CLIENT_PATH,
    ...walk(path.join(TASKTIMER_ROOT, "components")).filter((p) => p.endsWith(".tsx") || p.endsWith(".ts")),
    path.join(TASKTIMER_ROOT, "page.tsx"),
  ].filter((p) => fs.existsSync(p));

  const hooks = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const m of content.matchAll(/data-(action|history-action|menu|move-mode)=["']([^"']+)["']/g)) {
      hooks.push(`data-${m[1]}="${m[2]}"`);
    }
  }
  return uniqueSorted(hooks);
}

function generateBlock() {
  const routes = getRoutes();
  const keys = getStorageKeys();
  const hooks = getDataHooks();

  const routeLines = routes.map((r) => `- \`${r}\``).join("\n");
  const keyLines = keys.map((k) => `- \`${k}\``).join("\n");
  const hookLines = hooks.map((h) => `- \`${h}\``).join("\n");

  return [
    START_MARKER,
    "## Auto-Generated Context",
    "### Routes (derived from `src/app/tasktimer/**/page.tsx`)",
    routeLines || "- (none)",
    "",
    "### Persistent keys (derived from storage/client modules)",
    keyLines || "- (none)",
    "",
    "### Data hooks (derived from client/components)",
    hookLines || "- (none)",
    END_MARKER,
  ].join("\n");
}

function updateAgents(checkOnly) {
  if (!fs.existsSync(AGENTS_PATH)) {
    throw new Error(`Missing AGENTS.md at ${AGENTS_PATH}`);
  }
  const content = fs.readFileSync(AGENTS_PATH, "utf8");
  const block = generateBlock();

  let next = content;
  const blockRe = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, "m");
  if (blockRe.test(content)) {
    next = content.replace(blockRe, block);
  } else {
    next = `${content.replace(/\s*$/, "")}\n\n${block}\n`;
  }
  next = `${next.replace(/\s*$/, "")}\n`;

  if (checkOnly) {
    if (next !== content) {
      console.error("AGENTS.md is out of date. Run: npm run agents:update");
      process.exit(1);
    }
    console.log("AGENTS.md is up to date.");
    return;
  }

  fs.writeFileSync(AGENTS_PATH, next, "utf8");
  console.log("Updated AGENTS.md auto-context block.");
}

const checkOnly = process.argv.includes("--check");
updateAgents(checkOnly);
