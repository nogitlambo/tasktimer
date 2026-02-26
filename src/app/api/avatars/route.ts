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
    const entries = await fs.readdir(avatarsDir, { withFileTypes: true });

    const avatars = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b))
      .map((fileName) => ({
        id: fileName.replace(/\.[^.]+$/, ""),
        src: `/avatars/${fileName}`,
        label: labelFromFilename(fileName),
      }));

    return NextResponse.json({ avatars });
  } catch {
    return NextResponse.json({ avatars: [] }, { status: 200 });
  }
}

