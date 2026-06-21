import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const buildGradlePath = path.join(root, "android", "app", "build.gradle");

function fail(message) {
  throw new Error(`[android-version-check] ${message}`);
}

function readJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`Could not parse ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const [packageJsonRaw, packageLockRaw, buildGradleRaw] = await Promise.all([
  readFile(packageJsonPath, "utf8"),
  readFile(packageLockPath, "utf8"),
  readFile(buildGradlePath, "utf8"),
]);

const packageJson = readJson(packageJsonRaw, "package.json");
const packageLock = readJson(packageLockRaw, "package-lock.json");

const packageVersion = String(packageJson.version || "").trim();
if (!packageVersion) fail("package.json version is missing.");

const lockVersion = String(packageLock.version || "").trim();
const lockRootVersion = String(packageLock.packages?.[""]?.version || "").trim();
if (lockVersion !== packageVersion) {
  fail(`package-lock.json version ${lockVersion || "(missing)"} does not match package.json version ${packageVersion}.`);
}
if (lockRootVersion !== packageVersion) {
  fail(`package-lock root package version ${lockRootVersion || "(missing)"} does not match package.json version ${packageVersion}.`);
}

const versionNameMatches = [...buildGradleRaw.matchAll(/^\s*versionName\s+"([^"]+)"\s*$/gm)];
if (versionNameMatches.length !== 1) {
  fail(`Expected exactly one Android versionName declaration, found ${versionNameMatches.length}.`);
}
const androidVersionName = String(versionNameMatches[0][1] || "").trim();
if (androidVersionName !== packageVersion) {
  fail(`Android versionName ${androidVersionName || "(missing)"} does not match package.json version ${packageVersion}.`);
}

const versionCodeMatches = [...buildGradleRaw.matchAll(/^\s*versionCode\s+(\d+)\s*$/gm)];
if (versionCodeMatches.length !== 1) {
  fail(`Expected exactly one Android versionCode declaration, found ${versionCodeMatches.length}.`);
}
const androidVersionCode = Number(versionCodeMatches[0][1]);
if (!Number.isSafeInteger(androidVersionCode) || androidVersionCode < 1) {
  fail(`Android versionCode must be a positive integer, received ${versionCodeMatches[0][1] || "(missing)"}.`);
}

console.log(`Android version metadata is consistent: versionName ${packageVersion}, versionCode ${androidVersionCode}.`);
