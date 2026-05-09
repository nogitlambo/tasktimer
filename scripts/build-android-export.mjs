import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const stagingRoot = path.join(root, "workspace", "android-export-staging");
const stagedApiDir = path.join(stagingRoot, "api");

function parseCliArgs(argv) {
  const args = { envFile: "" };
  for (const arg of argv) {
    if (typeof arg !== "string") continue;
    if (arg.startsWith("--env-file=")) {
      args.envFile = arg.slice("--env-file=".length).trim();
    }
  }
  return args;
}

function parseEnvFileContents(raw) {
  const output = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key) continue;
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
    output[key] = value;
  }
  return output;
}

async function loadEnvOverrides(envFileArg) {
  const normalized = String(envFileArg || "").trim();
  if (!normalized) return {};
  const envPath = path.isAbsolute(normalized) ? normalized : path.join(root, normalized);
  if (!existsSync(envPath)) {
    throw new Error(`Android export env file not found: ${envPath}`);
  }
  return parseEnvFileContents(await readFile(envPath, "utf8"));
}

async function restoreApiDir() {
  if (!existsSync(stagedApiDir)) return;
  if (existsSync(apiDir)) {
    throw new Error(`Cannot restore API routes because ${apiDir} already exists.`);
  }
  await cp(stagedApiDir, apiDir, { recursive: true, force: true });
  await rm(stagedApiDir, { recursive: true, force: true });
}

async function stageApiDir() {
  if (!existsSync(apiDir)) return false;
  await mkdir(stagingRoot, { recursive: true });
  if (existsSync(stagedApiDir)) {
    await rm(stagedApiDir, { recursive: true, force: true });
  }
  await cp(apiDir, stagedApiDir, { recursive: true, force: true });
  await rm(apiDir, { recursive: true, force: true });
  return true;
}

let apiDirMoved = false;

try {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const envOverrides = await loadEnvOverrides(cliArgs.envFile);
  apiDirMoved = await stageApiDir();

  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: root,
    env: {
      ...process.env,
      ...envOverrides,
      NEXT_ANDROID_EXPORT: "1",
    },
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
} finally {
  if (apiDirMoved) {
    await restoreApiDir();
  }
}
