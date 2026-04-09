import { mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const stagingRoot = path.join(root, "workspace", "android-export-staging");
const stagedApiDir = path.join(stagingRoot, "api");

async function restoreApiDir() {
  if (!existsSync(stagedApiDir)) return;
  if (existsSync(apiDir)) {
    throw new Error(`Cannot restore API routes because ${apiDir} already exists.`);
  }
  await rename(stagedApiDir, apiDir);
}

async function stageApiDir() {
  if (!existsSync(apiDir)) return false;
  await mkdir(stagingRoot, { recursive: true });
  if (existsSync(stagedApiDir)) {
    throw new Error(`Staging path already exists: ${stagedApiDir}`);
  }
  await rename(apiDir, stagedApiDir);
  return true;
}

let apiDirMoved = false;

try {
  apiDirMoved = await stageApiDir();

  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: root,
    env: {
      ...process.env,
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
