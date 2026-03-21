import { execFileSync } from "node:child_process";

const args = process.argv.includes("--check") ? ["scripts/docs_sync.mjs", "--check", "--target=agents"] : ["scripts/docs_sync.mjs", "--write", "--target=agents"];

execFileSync(process.execPath, args, { stdio: "inherit" });
