import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

const VERSION_CODE_PATTERN = /^(\s*versionCode\s+)(\d+)(\s*)$/gm;
const VERSION_NAME_PATTERN = /^(\s*versionName\s+")([^"]+)("\s*)$/gm;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function fail(message) {
  throw new Error(`[android-version-prompt] ${message}`);
}

function exactlyOneMatch(contents, pattern, label) {
  const matches = [...contents.matchAll(pattern)];
  if (matches.length !== 1) {
    fail(`Expected exactly one Android ${label} declaration, found ${matches.length}.`);
  }
  return matches[0];
}

export function validateVersionCode(value, currentVersionCode) {
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    return { error: "Version code must be a positive integer." };
  }

  const versionCode = Number(normalized);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
    return { error: "Version code must be a safe positive integer." };
  }
  if (versionCode < currentVersionCode) {
    return { error: `Version code cannot be lower than the current value (${currentVersionCode}).` };
  }
  return { value: versionCode };
}

export function validateVersionName(value) {
  const normalized = String(value).trim();
  if (!SEMVER_PATTERN.test(normalized)) {
    return { error: "Version name must be a valid semantic version (for example, 1.3.7)." };
  }
  return { value: normalized };
}

export async function readVersionMetadata(root) {
  const packageJsonPath = path.join(root, "package.json");
  const packageLockPath = path.join(root, "package-lock.json");
  const buildGradlePath = path.join(root, "android", "app", "build.gradle");
  const [packageJsonRaw, packageLockRaw, buildGradleRaw] = await Promise.all([
    readFile(packageJsonPath, "utf8"),
    readFile(packageLockPath, "utf8"),
    readFile(buildGradlePath, "utf8"),
  ]);

  const codeMatch = exactlyOneMatch(buildGradleRaw, VERSION_CODE_PATTERN, "versionCode");
  const nameMatch = exactlyOneMatch(buildGradleRaw, VERSION_NAME_PATTERN, "versionName");
  const currentVersionCode = Number(codeMatch[2]);
  if (!Number.isSafeInteger(currentVersionCode) || currentVersionCode < 1) {
    fail(`Invalid current Android versionCode: ${codeMatch[2]}.`);
  }

  return {
    paths: { packageJsonPath, packageLockPath, buildGradlePath },
    raw: { packageJsonRaw, packageLockRaw, buildGradleRaw },
    currentVersionCode,
    currentVersionName: nameMatch[2].trim(),
  };
}

async function promptUntilValid({ prompt, message, defaultValue, validate, log }) {
  while (true) {
    const answer = await prompt(`${message} [${defaultValue}]: `);
    const result = validate(String(answer).trim() || String(defaultValue));
    if ("value" in result) return result.value;
    log(result.error);
  }
}

export async function configureAndroidVersion({
  root = process.cwd(),
  prompt,
  isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  log = (message) => console.log(message),
} = {}) {
  if (!isInteractive) {
    fail("An interactive terminal is required. Run `npm run android:aab` directly in a terminal.");
  }
  if (typeof prompt !== "function") fail("No interactive prompt implementation was provided.");

  const metadata = await readVersionMetadata(root);
  const versionCode = await promptUntilValid({
    prompt,
    message: "Android version code",
    defaultValue: metadata.currentVersionCode,
    validate: (value) => validateVersionCode(value, metadata.currentVersionCode),
    log,
  });
  const versionName = await promptUntilValid({
    prompt,
    message: "Version name",
    defaultValue: metadata.currentVersionName,
    validate: validateVersionName,
    log,
  });

  let packageJson;
  let packageLock;
  try {
    packageJson = JSON.parse(metadata.raw.packageJsonRaw);
    packageLock = JSON.parse(metadata.raw.packageLockRaw);
  } catch (error) {
    fail(`Could not parse package metadata: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!packageLock.packages?.[""]) fail("package-lock.json is missing its root package entry.");

  packageJson.version = versionName;
  packageLock.version = versionName;
  packageLock.packages[""].version = versionName;
  const buildGradle = metadata.raw.buildGradleRaw
    .replace(VERSION_CODE_PATTERN, `$1${versionCode}$3`)
    .replace(VERSION_NAME_PATTERN, `$1${versionName}$3`);

  await writeFile(metadata.paths.packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  await writeFile(metadata.paths.packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, "utf8");
  await writeFile(metadata.paths.buildGradlePath, buildGradle, "utf8");
  log(`Android version metadata updated: versionName ${versionName}, versionCode ${versionCode}.`);
  return { versionCode, versionName };
}

export async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail("An interactive terminal is required. Run `npm run android:aab` directly in a terminal.");
  }

  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  try {
    await configureAndroidVersion({
      prompt: (message) => readline.question(message, { signal: controller.signal }),
    });
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      console.log("\nAndroid AAB build cancelled; version metadata was not changed.");
      process.exitCode = 130;
      return;
    }
    throw error;
  } finally {
    process.removeListener("SIGINT", cancel);
    readline.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
