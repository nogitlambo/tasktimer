import fs from "node:fs";
import path from "node:path";

const START_MARKER = "<!-- AUTO-CONTEXT:START -->";
const END_MARKER = "<!-- AUTO-CONTEXT:END -->";

function normalizeSlashes(value) {
  return value.replaceAll("\\", "/");
}

function rel(root, target) {
  return normalizeSlashes(path.relative(root, target));
}

function abs(root, target) {
  return normalizeSlashes(path.join(root, target));
}

function fileLink(root, relPath) {
  const normalized = normalizeSlashes(relPath);
  return `[\`${normalized}\`](/${abs(root, normalized)})`;
}

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

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function getPageRoutes(root) {
  const appRoot = path.join(root, "src", "app");
  const pages = walk(appRoot).filter((p) => p.endsWith(`${path.sep}page.tsx`) || p.endsWith(`${path.sep}page.ts`));
  return uniqueSorted(
    pages.map((p) => {
      const routeDir = rel(root, p).replace(/^src\/app/, "").replace(/\/page\.tsx?$/, "") || "/";
      return routeDir === "" ? "/" : routeDir;
    })
  );
}

function getTaskLaunchRoutes(root) {
  const allowedRoutes = new Set([
    "/tasklaunch",
    "/dashboard",
    "/friends",
    "/settings",
    "/history-manager",
    "/user-guide",
    "/feedback",
  ]);
  return getPageRoutes(root).filter((route) => allowedRoutes.has(route));
}

function getStorageKeys(root) {
  const storagePath = path.join(root, "src", "app", "tasktimer", "lib", "storage.ts");
  const clientPath = path.join(root, "src", "app", "tasktimer", "tasktimerClient.ts");
  const statePath = path.join(root, "src", "app", "tasktimer", "client", "state.ts");
  const keys = [];
  if (exists(storagePath)) {
    const content = readText(storagePath);
    const match = content.match(/export const STORAGE_KEY\s*=\s*["'`]([^"'`]+)["'`]/);
    if (match) keys.push(`STORAGE_KEY = "${match[1]}"`);
  }
  if (exists(statePath)) {
    const content = readText(statePath);
    for (const match of content.matchAll(/([A-Z0-9_]+_KEY):\s*`([^`]+)`/g)) {
      keys.push(`${match[1]} = \`${match[2]}\``);
    }
  }
  if (exists(clientPath)) {
    const content = readText(clientPath);
    for (const match of content.matchAll(/const\s+([A-Z0-9_]+_KEY)\s*=\s*`([^`]+)`/g)) {
      keys.push(`${match[1]} = \`${match[2]}\``);
    }
  }
  return uniqueSorted(keys);
}

function getDataHooks(root) {
  const tasktimerRoot = path.join(root, "src", "app", "tasktimer");
  const files = walk(tasktimerRoot).filter((p) => p.endsWith(".ts") || p.endsWith(".tsx"));
  const hooks = [];
  for (const file of files) {
    const content = readText(file);
    for (const match of content.matchAll(/data-(action|history-action|menu|move-mode)=["']([^"']+)["']/g)) {
      const value = String(match[2] || "");
      if (!value || value.includes("${") || value.includes("{") || /\s/.test(value)) continue;
      hooks.push(`data-${match[1]}="${value}"`);
    }
  }
  return uniqueSorted(hooks);
}

function getPackageMetadata(root) {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(readText(pkgPath));
  return {
    name: pkg.name || "unknown",
    nextVersion: pkg.dependencies?.next || "unknown",
    reactVersion: pkg.dependencies?.react || "unknown",
    scripts: Object.keys(pkg.scripts || {}).sort((a, b) => a.localeCompare(b)),
  };
}

function getWorkflowFiles(root) {
  const workflowRoot = path.join(root, ".github", "workflows");
  if (!exists(workflowRoot)) return [];
  return uniqueSorted(
    fs.readdirSync(workflowRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => `.github/workflows/${entry.name}`)
  );
}

function getTopLevelSourceDirs(root) {
  const candidates = [
    "src/app",
    "src/lib",
    "src/app/tasklaunch",
    "src/app/tasktimer",
    "src/features/tasktimer-react",
    "scripts",
    ".github/workflows",
  ];
  return candidates.filter((entry) => exists(path.join(root, entry)));
}

function getTaskTimerLibFiles(root) {
  const dir = path.join(root, "src", "app", "tasktimer", "lib");
  if (!exists(dir)) return [];
  return uniqueSorted(
    fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")))
      .map((entry) => `src/app/tasktimer/lib/${entry.name}`)
  );
}

function getFeatureSubdirs(root) {
  const dir = path.join(root, "src", "features", "tasktimer-react");
  if (!exists(dir)) return [];
  return uniqueSorted(
    fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `src/features/tasktimer-react/${entry.name}`)
  );
}

function getTaskTimerClientSupportFiles(root) {
  const dir = path.join(root, "src", "app", "tasktimer", "client");
  if (!exists(dir)) return [];
  return uniqueSorted(
    fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")))
      .map((entry) => `src/app/tasktimer/client/${entry.name}`)
  );
}

function getTaskTimerPageFiles(root) {
  const appRoot = path.join(root, "src", "app");
  const allowedFiles = new Set([
    "src/app/tasklaunch/page.tsx",
    "src/app/dashboard/page.tsx",
    "src/app/friends/page.tsx",
    "src/app/settings/page.tsx",
    "src/app/history-manager/page.tsx",
    "src/app/user-guide/page.tsx",
    "src/app/feedback/page.tsx",
  ]);
  const files = walk(appRoot)
    .filter((p) => p.endsWith(`${path.sep}page.tsx`) || p.endsWith(`${path.sep}page.ts`))
    .map((p) => rel(root, p));
  return uniqueSorted(files.filter((p) => allowedFiles.has(p)));
}

function bulletLines(values, root) {
  return values.map((value) => `- ${fileLink(root, value)}`).join("\n");
}

function textBulletLines(values) {
  return values.map((value) => `- \`${value}\``).join("\n");
}

export function generateAgentsBlock(root) {
  const routes = getTaskLaunchRoutes(root);
  const keys = getStorageKeys(root);
  const hooks = getDataHooks(root);
  return [
    START_MARKER,
    "## Auto-Generated Context",
    "### Routes (derived from authenticated app page files)",
    textBulletLines(routes) || "- (none)",
    "",
    "### Persistent keys (derived from storage/client modules)",
    textBulletLines(keys) || "- (none)",
    "",
    "### Data hooks (derived from client/components)",
    textBulletLines(hooks) || "- (none)",
    END_MARKER,
  ].join("\n");
}

export function updateAgentsContent(root, content) {
  const block = generateAgentsBlock(root);
  const blockRe = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, "m");
  let next = content;
  if (blockRe.test(content)) next = content.replace(blockRe, block);
  else next = `${content.replace(/\s*$/, "")}\n\n${block}\n`;
  return `${next.replace(/\s*$/, "")}\n`;
}

export function generateArchitectureContent(root) {
  const pkg = getPackageMetadata(root);
  const allRoutes = getPageRoutes(root);
  const taskTimerRoutes = getTaskLaunchRoutes(root);
  const topLevelDirs = getTopLevelSourceDirs(root);
  const taskTimerPages = getTaskTimerPageFiles(root);
  const taskTimerClientFiles = getTaskTimerClientSupportFiles(root);
  const taskTimerLibFiles = getTaskTimerLibFiles(root);
  const featureSubdirs = getFeatureSubdirs(root);
  const workflowFiles = getWorkflowFiles(root);
  const docsScripts = pkg.scripts.filter((name) => name.startsWith("docs:") || name.startsWith("agents:") || name.startsWith("hooks:"));

  return [
    "# Architecture",
    "",
    "> Auto-generated by `scripts/docs_sync.mjs`. Update source code and rerun `npm run docs:update` instead of editing this file directly.",
    "",
    "## Repository Overview",
    "",
    `- Package name: \`${pkg.name}\``,
    `- Frameworks: \`next@${pkg.nextVersion}\`, \`react@${pkg.reactVersion}\``,
    "- Primary product surface: authenticated TaskLaunch routes under `/tasklaunch`, `/dashboard`, `/friends`, `/settings`, `/history-manager`, `/user-guide`, and `/feedback`",
    "- Documentation automation is generated from current repo structure and scripts",
    "",
    "## Top-Level Source Map",
    "",
    textBulletLines(topLevelDirs),
    "",
    "## Route Inventory",
    "",
    "### App Routes",
    textBulletLines(allRoutes),
    "",
    "### TaskLaunch Routes",
    textBulletLines(taskTimerRoutes),
    "",
    "## Runtime Entry Points",
    "",
    `- Main app shell: ${fileLink(root, "src/app/tasktimer/TaskTimerPageClient.tsx")}`,
    `- Legacy runtime bootstrap: ${fileLink(root, "src/app/tasktimer/tasktimerClient.ts")}`,
    `- TaskLaunch auth layout: ${fileLink(root, "src/app/tasklaunch/layout.tsx")} plus root-level authenticated route layouts`,
    `- Shared Firebase auth client: ${fileLink(root, "src/lib/firebaseClient.ts")}`,
    `- Shared Firestore client: ${fileLink(root, "src/lib/firebaseFirestoreClient.ts")}`,
    "",
    "## TaskLaunch Route Files",
    "",
    bulletLines(taskTimerPages, root),
    "",
    "## TaskTimer Client Support Modules",
    "",
    bulletLines(taskTimerClientFiles, root) || "- (none)",
    "",
    "## TaskTimer Domain Libraries",
    "",
    bulletLines(taskTimerLibFiles, root) || "- (none)",
    "",
    "## Secondary React Feature Module",
    "",
    bulletLines(featureSubdirs, root) || "- (none)",
    "",
    "## Documentation Automation",
    "",
    "### Generated Docs",
    `- ${fileLink(root, "AGENTS.md")} keeps manual guidance plus an auto-generated context block`,
    `- ${fileLink(root, "architecture.md")} is fully generated from repo inspection`,
    "",
    "### Relevant Scripts",
    textBulletLines(docsScripts),
    "",
    "### Workflow Files",
    bulletLines(workflowFiles, root) || "- (none)",
    "",
    "## Notes",
    "",
    "- Route and module lists are derived from files present in the repository at generation time.",
    "- Behavioral descriptions are limited to discoverable runtime boundaries and file relationships.",
    "",
  ].join("\n");
}
