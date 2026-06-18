import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const buildGradlePath = path.join(root, "android", "app", "build.gradle");
const versionCodePattern = /^(\s*versionCode\s+)(\d+)(\s*)$/gm;

const contents = await readFile(buildGradlePath, "utf8");
const matches = [...contents.matchAll(versionCodePattern)];

if (matches.length !== 1) {
  throw new Error(
    `Expected exactly one Android versionCode declaration in ${buildGradlePath}, found ${matches.length}.`,
  );
}

const currentVersionCode = Number(matches[0][2]);
if (!Number.isSafeInteger(currentVersionCode) || currentVersionCode < 1) {
  throw new Error(`Invalid Android versionCode: ${matches[0][2]}`);
}

const nextVersionCode = currentVersionCode + 1;
const updatedContents = contents.replace(
  versionCodePattern,
  `$1${nextVersionCode}$3`,
);

await writeFile(buildGradlePath, updatedContents, "utf8");

console.log(
  `Android versionCode bumped from ${currentVersionCode} to ${nextVersionCode}.`,
);
