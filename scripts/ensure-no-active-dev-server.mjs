import { execFileSync } from "node:child_process";
import path from "node:path";

function normalizePathForMatch(value) {
  return String(value || "")
    .trim()
    .replace(/\//g, "\\")
    .toLowerCase();
}

function loadNodeProcesses() {
  if (process.platform === "win32") {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    if (!output) return [];
    const parsed = JSON.parse(output);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((row) => ({
      pid: Number.parseInt(String(row.ProcessId || ""), 10),
      commandLine: String(row.CommandLine || ""),
    }));
  }

  const output = execFileSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/);
      return {
        pid: Number.parseInt(match?.[1] || "", 10),
        commandLine: String(match?.[2] || ""),
      };
    })
    .filter((row) => Number.isInteger(row.pid) && row.pid > 0);
}

function isMatchingDevProcess(commandLine, repoRoot) {
  const normalizedCommand = normalizePathForMatch(commandLine);
  return (
    normalizedCommand.includes(repoRoot) &&
    normalizedCommand.includes("next") &&
    normalizedCommand.includes("dev")
  );
}

function ensureNoActiveDevServer() {
  const repoRoot = normalizePathForMatch(path.resolve(process.cwd()));
  const matchingProcesses = loadNodeProcesses().filter(
    (row) => row.pid !== process.pid && isMatchingDevProcess(row.commandLine, repoRoot)
  );

  if (!matchingProcesses.length) {
    console.log("[build] No active local Next dev server detected.");
    return;
  }

  const pidList = matchingProcesses.map((row) => row.pid).join(", ");
  console.error(`[build] Refusing to run while local dev server is active for this repo. Stop \`npm run dev\` first. Active PID${matchingProcesses.length === 1 ? "" : "s"}: ${pidList}`);
  process.exit(1);
}

ensureNoActiveDevServer();
