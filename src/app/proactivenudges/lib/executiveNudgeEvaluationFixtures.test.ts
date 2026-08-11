import { describe, expect, it } from "vitest";

import { runExecutiveNudgeEvaluationFixtures } from "./executiveNudgeEvaluationFixtures";

describe("Executive Nudge deterministic evaluation fixtures", () => {
  it("keeps the public arbitration safety matrix deterministic", () => {
    for (const fixture of runExecutiveNudgeEvaluationFixtures()) {
      expect(fixture.actual.selected?.id ?? null, fixture.name).toBe(fixture.expected.selectedCandidateId);
      expect(fixture.actual.selectedCount, fixture.name).toBe(fixture.expected.selectedCandidateId ? 1 : 0);
      for (const suppressionCode of fixture.expected.suppressionCodes) {
        expect(fixture.actual.suppressions.some((suppression) => suppression.code === suppressionCode), fixture.name).toBe(true);
      }
    }
  });
});
