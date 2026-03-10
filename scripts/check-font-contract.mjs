import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const layoutPath = path.join(ROOT, "src", "app", "layout.tsx");
const globalsPath = path.join(ROOT, "src", "app", "globals.css");

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function assertMatch(content, pattern, message) {
  if (!pattern.test(content)) {
    throw new Error(message);
  }
}

function main() {
  const layout = read(layoutPath);
  const globals = read(globalsPath);

  assertMatch(
    layout,
    /import\s*\{[^}]*\bOrbitron\b[^}]*\}\s*from\s*"next\/font\/google";/m,
    "Root layout must import Orbitron from next/font/google."
  );

  assertMatch(
    layout,
    /const\s+orbitron\s*=\s*Orbitron\s*\(/m,
    "Root layout must define the Orbitron font loader."
  );

  assertMatch(
    layout,
    /weight:\s*\[\s*"400"\s*,\s*"500"\s*,\s*"600"\s*,\s*"700"\s*,\s*"800"\s*,\s*"900"\s*\]/m,
    "Orbitron must load weights 400, 500, 600, 700, 800, and 900 to avoid browser font fallback."
  );

  assertMatch(
    layout,
    /className=\{`[^`]*\$\{orbitron\.className\}[^`]*\$\{orbitron\.variable\}[^`]*`\}/m,
    "Root body className must include both orbitron.className and orbitron.variable."
  );

  assertMatch(
    globals,
    /--font-readable:\s*var\(--font-orbitron\),\s*"Segoe UI Variable",\s*"Segoe UI",\s*Arial,\s*sans-serif;/m,
    "globals.css must keep --font-readable mapped to Orbitron."
  );

  assertMatch(
    globals,
    /--font-display-ui:\s*var\(--font-orbitron\),\s*"Segoe UI Variable",\s*"Segoe UI",\s*Arial,\s*sans-serif;/m,
    "globals.css must keep --font-display-ui mapped to Orbitron."
  );

  assertMatch(
    globals,
    /--font-sans:\s*var\(--font-orbitron\);/m,
    "Tailwind's --font-sans token must resolve to Orbitron."
  );

  assertMatch(
    globals,
    /body\s*\{[\s\S]*font-family:\s*var\(--font-readable\);[\s\S]*\}/m,
    "The global body rule must continue to use --font-readable."
  );

  console.log("Font contract check passed.");
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? `Font contract check failed: ${error.message}` : "Font contract check failed."
  );
  process.exit(1);
}
