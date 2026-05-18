import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputVideo = resolve(repoRoot, "public", "rocket_breaking_chains4.mp4");
const outputVideo = resolve(repoRoot, "public", "rocket_breaking_chains4_opticalflow_60fps_50pct.mp4");
const outputPoster = resolve(repoRoot, "public", "rocket_breaking_chains4_opticalflow_60fps_50pct_poster.jpg");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

function runFfmpeg(args) {
  const result = spawnSync(ffmpeg, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error(
        "FFmpeg was not found. Install ffmpeg or set FFMPEG_PATH to the ffmpeg executable, then rerun npm run media:landing-video.",
      );
    } else {
      console.error(result.error.message);
    }
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(inputVideo)) {
  console.error(`Missing source video: ${inputVideo}`);
  process.exit(1);
}

runFfmpeg([
  "-y",
  "-i",
  inputVideo,
  "-an",
  "-vf",
  "setpts=2*PTS,minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  outputVideo,
]);

runFfmpeg([
  "-y",
  "-i",
  outputVideo,
  "-frames:v",
  "1",
  "-update",
  "1",
  "-q:v",
  "2",
  outputPoster,
]);
