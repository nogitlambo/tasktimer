import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function run(command, args, options = {}) {
  const executable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : command;
  const executableArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", [command, ...args].join(" ")]
    : args;
  execFileSync(executable, executableArgs, {
    cwd: options.cwd || root,
    stdio: "inherit",
  });
}

function assertNoRootFirebaseCredentialFiles() {
  const offenders = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^tasktimer-prod-.*\.json$/i.test(name) || /firebase-adminsdk/i.test(name));

  if (offenders.length) {
    throw new Error(
      `Root Firebase credential file(s) found: ${offenders.join(", ")}. Store local credentials outside the repo root, preferably via Application Default Credentials or workspace/.`
    );
  }
}

function audit(cwd) {
  run("npm", ["audit", "--omit=dev", "--audit-level=high"], { cwd });
}

assertNoRootFirebaseCredentialFiles();
audit(root);

const functionsDir = path.join(root, "functions");
if (existsSync(path.join(functionsDir, "package.json"))) {
  audit(functionsDir);
}
