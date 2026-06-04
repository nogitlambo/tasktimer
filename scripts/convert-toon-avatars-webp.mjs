import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const AVATAR_ROOT = path.join(process.cwd(), "public", "avatars");
const AVATAR_DIR_NAMES = ["toons", "bottts", "action-heroes"];
const SIZE = 512;
const INPUT_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function isSupportedInput(fileName) {
  return INPUT_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function outputPathFor(filePath) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.webp`);
}

function circleMaskSvg(size) {
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeFileWithRetry(filePath, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.unlink(filePath);
      return;
    } catch (error) {
      if (attempt === attempts || error?.code === "ENOENT") {
        if (error?.code === "ENOENT") return;
        throw error;
      }
      await wait(100 * attempt);
    }
  }
}

async function convertToCircularWebp(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const outputPath = outputPathFor(inputPath);
  if (ext === ".webp" && inputPath === outputPath) return { inputPath, outputPath, skipped: true };

  const tmpPath = `${outputPath}.tmp-${process.pid}`;
  const mask = circleMaskSvg(SIZE);
  const input = await fs.readFile(inputPath);
  await sharp(input, { animated: false })
    .rotate()
    .resize({
      width: SIZE,
      height: SIZE,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(tmpPath);
  await fs.rm(outputPath, { force: true });
  await fs.rename(tmpPath, outputPath);
  if (inputPath !== outputPath) await removeFileWithRetry(inputPath);
  return { inputPath, outputPath, skipped: false };
}

async function collectAvatarFiles(dirName) {
  const avatarDir = path.join(AVATAR_ROOT, dirName);
  const entries = await fs.readdir(avatarDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && isSupportedInput(entry.name))
    .map((entry) => path.join(avatarDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

async function main() {
  const results = [];
  for (const dirName of AVATAR_DIR_NAMES) {
    const files = await collectAvatarFiles(dirName);
    for (const filePath of files) {
      results.push({ dirName, ...(await convertToCircularWebp(filePath)) });
    }
  }

  const converted = results.filter((result) => !result.skipped);
  const skipped = results.filter((result) => result.skipped);
  console.log(`Converted ${converted.length} bundled avatar(s) to circular WebP.`);
  if (skipped.length) console.log(`Skipped ${skipped.length} existing WebP avatar(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
