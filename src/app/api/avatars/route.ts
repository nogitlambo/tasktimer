import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const ALLOWED_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function labelFromFilename(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "");
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export async function GET() {
  try {
    const avatarsDir = path.join(process.cwd(), "public", "avatars");
    const walkAvatarFiles = async (dir: string, relDir = ""): Promise<string[]> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const entryAbsPath = path.join(dir, entry.name);
        const entryRelPath = relDir ? path.posix.join(relDir, entry.name) : entry.name;
        if (entry.isDirectory()) {
          files.push(...(await walkAvatarFiles(entryAbsPath, entryRelPath)));
          continue;
        }
        if (!entry.isFile()) continue;
        if (!ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
        files.push(entryRelPath);
      }
      return files;
    };

    const avatars = (await walkAvatarFiles(avatarsDir))
      .sort((a, b) => a.localeCompare(b))
      .map((relativePath) => {
        const normalized = relativePath.replace(/\\/g, "/");
        const fileName = path.posix.basename(normalized);
        return {
          id: normalized.replace(/\.[^.]+$/, ""),
          src: `/avatars/${normalized}`,
          label: labelFromFilename(fileName),
        };
      });

    return NextResponse.json({ avatars });
  } catch {
    return NextResponse.json({ avatars: [] }, { status: 200 });
  }
}

