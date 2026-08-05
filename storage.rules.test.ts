import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("storage.rules Brain Dump source paths", () => {
  it("keeps Brain Dump source files user-scoped, private, size-limited, and content-type-limited", () => {
    const source = readFileSync(resolve(__dirname, "storage.rules"), "utf8");

    expect(source).toContain("match /users/{userId}/brain-dump-sources/{sessionId}/{fileName}");
    expect(source).toContain("allow read, delete: if request.auth != null && request.auth.uid == userId;");
    expect(source).toContain("allow create: if request.auth != null");
    expect(source).toContain("&& request.auth.uid == userId");
    expect(source).toContain("&& request.resource.size <= 10485760");
    expect(source).toContain('"audio/webm"');
    expect(source).toContain('"image/jpeg"');
    expect(source).toContain('"image/png"');
    expect(source).toContain('"image/webp"');
    expect(source).toContain("allow update: if false;");
  });
});
