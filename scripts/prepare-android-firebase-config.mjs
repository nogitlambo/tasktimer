import { copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const variant = String(process.argv[2] || "").trim().toLowerCase();

if (variant !== "debug" && variant !== "release") {
  throw new Error('Usage: node scripts/prepare-android-firebase-config.mjs <debug|release>');
}

const sourcePath = path.join(root, "android", "app", `google-services.${variant}.json`);
const targetPath = path.join(root, "android", "app", "google-services.json");

if (!existsSync(sourcePath)) {
  throw new Error(
    `Missing Firebase Android config for ${variant}: ${sourcePath}\n` +
      `Create it from android/app/google-services.${variant}.json.example before building.`
  );
}

await copyFile(sourcePath, targetPath);
