import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ExecutivePageContent Brain Dump event handling", () => {
  it("opens the embedded Brain Dump face from the shared app event", () => {
    const source = readFileSync(resolve(__dirname, "ExecutivePageContent.tsx"), "utf8");

    expect(source).toContain('TASKTIMER_OPEN_BRAIN_DUMP_EVENT');
    expect(source).toContain('const openBrainDumpFromEvent = () => {');
    expect(source).toContain('setIsBrainDumpOpen(true);');
    expect(source).toContain('window.addEventListener(TASKTIMER_OPEN_BRAIN_DUMP_EVENT, openBrainDumpFromEvent)');
    expect(source).toContain('window.removeEventListener(TASKTIMER_OPEN_BRAIN_DUMP_EVENT, openBrainDumpFromEvent)');
  });
});
