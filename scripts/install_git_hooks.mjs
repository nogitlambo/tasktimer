import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
  console.log("Configured Git hooks path to .githooks");
} catch {
  console.error("Failed to configure Git hooks. Make sure Git is installed and run `git config core.hooksPath .githooks` manually if needed.");
  process.exit(1);
}
