import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");
const publicDir = path.join(root, "public");
const nextStaticDir = path.join(root, ".next", "static");

if (!existsSync(standaloneDir)) {
  process.exit(0);
}

if (existsSync(publicDir)) {
  cpSync(publicDir, path.join(standaloneDir, "public"), {
    recursive: true,
    force: true,
  });
}

if (existsSync(nextStaticDir)) {
  cpSync(nextStaticDir, path.join(standaloneDir, ".next", "static"), {
    recursive: true,
    force: true,
  });
}
