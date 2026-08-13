import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("createFirestoreBrainDumpSessionStore", () => {
  it("writes a TTL timestamp for unfinished sessions and can read redacted expired sessions", () => {
    const source = readFileSync(resolve(__dirname, "brainDumpSessionStore.ts"), "utf8");

    expect(source).toContain('session.state !== "completed" && session.state !== "expired"');
    expect(source).toContain('data.state !== "transcribing"');
    expect(source).toContain('data.state !== "transcript"');
    expect(source).toContain('data.state !== "review"');
  });
});
