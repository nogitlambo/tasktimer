import fs from "node:fs";
import path from "node:path";
import { generateArchitectureContent, updateAgentsContent } from "./docs_generator.mjs";

const ROOT = process.cwd();
const AGENTS_PATH = path.join(ROOT, "AGENTS.md");
const ARCHITECTURE_PATH = path.join(ROOT, "architecture.md");

function parseArgs(argv) {
  const wantsWrite = argv.includes("--write");
  const wantsCheck = argv.includes("--check");
  const targetArg = argv.find((entry) => entry.startsWith("--target="));
  const target = targetArg ? targetArg.split("=")[1] : "all";
  if (wantsWrite === wantsCheck) {
    throw new Error("Pass exactly one of --write or --check.");
  }
  if (!["all", "agents", "architecture"].includes(target)) {
    throw new Error(`Unsupported target: ${target}`);
  }
  return { mode: wantsWrite ? "write" : "check", target };
}

function buildNextFiles(target) {
  const next = [];
  if (target === "all" || target === "agents") {
    const current = fs.readFileSync(AGENTS_PATH, "utf8");
    next.push({
      label: "AGENTS.md",
      path: AGENTS_PATH,
      content: updateAgentsContent(ROOT, current),
    });
  }
  if (target === "all" || target === "architecture") {
    next.push({
      label: "architecture.md",
      path: ARCHITECTURE_PATH,
      content: `${generateArchitectureContent(ROOT).replace(/\s*$/, "")}\n`,
    });
  }
  return next;
}

function main() {
  const { mode, target } = parseArgs(process.argv.slice(2));
  const files = buildNextFiles(target);
  const stale = [];

  for (const file of files) {
    const current = fs.existsSync(file.path) ? fs.readFileSync(file.path, "utf8") : "";
    if (current !== file.content) stale.push(file);
  }

  if (mode === "check") {
    if (stale.length) {
      console.error(`Documentation is out of date: ${stale.map((file) => file.label).join(", ")}`);
      console.error("Run: npm run docs:update");
      process.exit(1);
    }
    console.log("Documentation is up to date.");
    return;
  }

  for (const file of stale) {
    fs.writeFileSync(file.path, file.content, "utf8");
    console.log(`Updated ${file.label}.`);
  }

  if (!stale.length) {
    console.log("Documentation already up to date.");
  }
}

main();
