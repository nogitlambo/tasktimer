import { readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "out");

const appLaunchRedirectHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="refresh" content="0;url=./tasklaunch/index.html">
    <title>TaskLaunch</title>
    <script>
      (function () {
        var suffix = (window.location.search || "") + (window.location.hash || "");
        window.location.replace("./tasklaunch/index.html" + suffix);
      })();
    </script>
  </head>
  <body></body>
</html>
`;

const pruneRelativePaths = [
  "_next.__PAGE__.txt",
  "_next._full.txt",
  "_next._head.txt",
  "_next._index.txt",
  "_next._tree.txt",
  "apple-touch-icon.png",
  "favicon.ico",
  "favicon.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "gradient1.png",
  "landing_arrowhead.svg",
  "landing_arrowhead_vector.svg",
  "landing_feature.png",
  "landing_feature-768.webp",
  "landing_feature-1440.webp",
  "landing_feature-2048.webp",
  "landing_feature_wide.png",
  "landing_feature_wide-768.webp",
  "landing_feature_wide-1440.webp",
  "landing_feature_wide-2048.webp",
  "opengraph-image.png",
  "rocket_breaking_chains4_opticalflow_60fps_50pct.mp4",
  "rocket_breaking_chains4_opticalflow_60fps_50pct_lastframe_mobile.webp",
  "rocket_breaking_chains4_opticalflow_60fps_50pct_lastframe_tablet.webp",
  "rocket_breaking_chains4_opticalflow_60fps_50pct_poster.jpg",
  "timebase-logo.svg",
  "twitter-image.png",
  "landing",
  "landingsoon",
  "logo/launch-icon-monochrome-google-play.png",
  "logo/launch-icon-white-transparent.svg",
  "logo/lime-icon.png",
  "logo/lime-icon-192.png",
  "logo/lime-icon-512.png",
  "logo/mobile-app-icon-dark-grey-1024.png",
  "logo/tasklaunch-icon-512.png",
  "logo/tasklaunch-logo.png",
  "leaderboard/deep-space-bg.png",
  "leaderboard/leaderboard_podium.png",
  "leaderboard/podium.png",
  "leaderboard/weekly.png",
  "leaderboard/weekly_podium.png",
  "insignias/000_unranked.png",
  "insignias/001_initiate.png",
  "insignias/002_operator.png",
  "insignias/003_technician.png",
  "insignias/004_engineer.png",
  "insignias/006_specialist.png",
  "insignias/007_strategist.png",
  "insignias/008_director.png",
  "insignias/009_ascendent.png",
  "insignias/010_commander.png",
  "insignias/011_architect.png",
  "insignias/012_overseer.png",
  "insignias/013_visionary.png",
  "insignias/014_soveriegn.png",
  "insignias/015_mythic.png",
  "onboarding/01_onboarding-chronotypes.png",
];

async function directorySizeBytes(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function writeNativeRootRedirect() {
  const indexPath = path.join(outDir, "index.html");
  await writeFile(indexPath, appLaunchRedirectHtml, "utf8");

  const indexTextPath = path.join(outDir, "index.txt");
  if (existsSync(indexTextPath)) {
    await writeFile(indexTextPath, "", "utf8");
  }
}

async function removeIfPresent(relativePath) {
  const targetPath = path.join(outDir, relativePath);
  if (!existsSync(targetPath)) return false;
  await rm(targetPath, { recursive: true, force: true });
  return true;
}

async function main() {
  if (!existsSync(outDir)) {
    throw new Error(`Android export output not found: ${outDir}`);
  }

  const beforeBytes = await directorySizeBytes(outDir);
  await writeNativeRootRedirect();

  let removedCount = 0;
  for (const relativePath of pruneRelativePaths) {
    if (await removeIfPresent(relativePath)) removedCount += 1;
  }

  const afterBytes = await directorySizeBytes(outDir);
  const savedBytes = Math.max(0, beforeBytes - afterBytes);
  console.log(
    `Optimized Android debug export: ${formatSize(beforeBytes)} -> ${formatSize(afterBytes)} ` +
      `(${formatSize(savedBytes)} saved, ${removedCount} paths pruned)`
  );
}

await main();
