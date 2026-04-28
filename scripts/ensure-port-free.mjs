import { execFileSync, execSync } from "node:child_process";

function parsePort(rawPort) {
  const port = Number.parseInt(String(rawPort || "3000"), 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${rawPort}`);
  }
  return port;
}

function listOwningPidsOnWindows(port) {
  const output = execSync("netstat -ano -p tcp", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const suffix = `:${port}`;
  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("TCP")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    const localAddress = parts[1] || "";
    const pid = Number.parseInt(parts[parts.length - 1] || "", 10);
    if (!localAddress.endsWith(suffix) || !Number.isInteger(pid) || pid <= 0) continue;
    if (pid === process.pid) continue;
    pids.add(pid);
  }
  return [...pids];
}

function listOwningPidsOnUnix(port) {
  const commands = [
    ["lsof", ["-ti", `TCP:${port}`]],
    ["sh", ["-lc", `ss -lptn 'sport = :${port}' | tail -n +2 | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\\1/'`]],
  ];
  for (const [command, args] of commands) {
    try {
      const output = execFileSync(command, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const pids = output
        .split(/\r?\n/)
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
      if (pids.length) return [...new Set(pids)];
    } catch {
      // Try the next command.
    }
  }
  return [];
}

function listOwningPids(port) {
  if (process.platform === "win32") return listOwningPidsOnWindows(port);
  return listOwningPidsOnUnix(port);
}

function killPid(pid) {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/F", "/T"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return;
  }
  process.kill(pid, "SIGTERM");
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ensurePortFree(port) {
  const initialPids = listOwningPids(port);
  if (!initialPids.length) {
    console.log(`[dev] Port ${port} is already free.`);
    return;
  }
  console.log(`[dev] Releasing port ${port} from PID${initialPids.length === 1 ? "" : "s"} ${initialPids.join(", ")}.`);
  for (const pid of initialPids) {
    try {
      killPid(pid);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[dev] Failed to terminate PID ${pid}: ${message}`);
    }
  }
  sleep(1000);
  const remainingPids = listOwningPids(port);
  if (remainingPids.length) {
    throw new Error(`Port ${port} is still in use by PID${remainingPids.length === 1 ? "" : "s"} ${remainingPids.join(", ")}.`);
  }
  console.log(`[dev] Port ${port} is free.`);
}

const port = parsePort(process.argv[2] || "3000");
ensurePortFree(port);
