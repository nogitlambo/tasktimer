import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const contentPath = join(rootDir, "src", "app", "user-guide", "content.ts");

function fail(message) {
  console.error(`[userguide:audit] ${message}`);
  process.exitCode = 1;
}

function readContentSource() {
  if (!existsSync(contentPath)) {
    fail(`Missing guide content file: ${contentPath}`);
    return "";
  }
  return readFileSync(contentPath, "utf8");
}

function extractArrayItems(source, exportName) {
  const match = source.match(new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\]`, "m"));
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
}

function extractModuleIds(source) {
  const modulesMatch = source.match(/export const USER_GUIDE_MODULES:[\s\S]*?= \[([\s\S]*)\];/m);
  if (!modulesMatch) return [];
  return Array.from(modulesMatch[1].matchAll(/\bid:\s*"([^"]+)"/g)).map((item) => item[1]);
}

function extractScreenshots(source) {
  return Array.from(source.matchAll(/\bscreenshot:\s*"([^"]+)"/g)).map((item) => item[1]);
}

const source = readContentSource();
const requiredIds = extractArrayItems(source, "REQUIRED_USER_GUIDE_MODULE_IDS");
const moduleIds = extractModuleIds(source);
const screenshots = extractScreenshots(source);

if (!requiredIds.length) fail("REQUIRED_USER_GUIDE_MODULE_IDS is empty or missing.");
if (!moduleIds.length) fail("USER_GUIDE_MODULES is empty or missing.");

const missingIds = requiredIds.filter((id) => !moduleIds.includes(id));
const extraIds = moduleIds.filter((id) => !requiredIds.includes(id));
if (missingIds.length) fail(`Missing guide modules: ${missingIds.join(", ")}`);
if (extraIds.length) fail(`Unexpected guide modules: ${extraIds.join(", ")}`);

if (new Set(moduleIds).size !== moduleIds.length) {
  fail("Duplicate guide module ids found.");
}

if (screenshots.length !== moduleIds.length) {
  fail(`Expected ${moduleIds.length} screenshots, found ${screenshots.length}.`);
}

for (const screenshot of screenshots) {
  if (!/^\/user-guide\/.+\.webp$/.test(screenshot)) {
    fail(`Guide screenshot must be a /user-guide/*.webp asset: ${screenshot}`);
    continue;
  }
  const screenshotPath = join(rootDir, "public", screenshot);
  if (!existsSync(screenshotPath)) {
    fail(`Missing guide screenshot asset: ${screenshotPath}`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`[userguide:audit] ${moduleIds.length} guide modules and ${screenshots.length} screenshots verified.`);
