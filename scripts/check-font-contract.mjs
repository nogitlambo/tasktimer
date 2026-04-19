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
    globals,
    /--font-orbitron:\s*[^;]+;/m,
    "globals.css must define --font-orbitron."
  );

  assertMatch(
    globals,
    /--font-geist-sans:\s*[^;]+;/m,
    "globals.css must define --font-geist-sans."
  );

  assertMatch(
    globals,
    /--font-geist-mono:\s*[^;]+;/m,
    "globals.css must define --font-geist-mono."
  );

  assertMatch(
    layout,
    /<body[\s\S]*className=("|')antialiased\1|<body[\s\S]*className=\{("|')antialiased\2\}/m,
    "Root body className must keep antialiased."
  );

  assertMatch(
    globals,
    /--font-archie:\s*[^;]+;/m,
    "globals.css must define --font-archie."
  );

  assertMatch(
    globals,
    /--font-readable:\s*var\(--font-archie\);/m,
    "globals.css must keep --font-readable mapped to --font-archie."
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
