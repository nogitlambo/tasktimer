import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./RankThumbnail", () => ({
  default: ({ rankId }: { rankId: string }) => createElement("span", { "data-rank-id": rankId }),
}));

import RankLadderModal from "./RankLadderModal";

describe("RankLadderModal", () => {
  it("renders earned ranks with stored promotion xp and localized date text", () => {
    const promotedAt = Date.parse("2026-05-05T10:00:00.000Z");
    const expectedDate = new Date(promotedAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const html = renderToStaticMarkup(
      <RankLadderModal
        open
        onClose={() => {}}
        totalXp={960}
        rankSummary="Your current rank is: Engineer."
        currentRankId="engineer"
        currentRankIndex={4}
        rankPromotionsById={{
          initiate: { promotedAt, promotedAtXp: 10 },
          operator: { promotedAt, promotedAtXp: 60 },
          technician: { promotedAt, promotedAtXp: 240 },
          engineer: { promotedAt, promotedAtXp: 960 },
        }}
        rankThumbnailSrc=""
        canSelectRankInsignia={false}
        onSelectRankThumbnail={async () => {}}
      />
    );

    expect(html).toContain(`Promoted at 960 XP on ${expectedDate}.`);
  });

  it("keeps locked ranks on the existing requirement copy", () => {
    const html = renderToStaticMarkup(
      <RankLadderModal
        open
        onClose={() => {}}
        totalXp={960}
        rankSummary="Your current rank is: Engineer."
        currentRankId="engineer"
        currentRankIndex={4}
        rankPromotionsById={{
          initiate: { promotedAt: Date.parse("2026-05-01T10:00:00.000Z"), promotedAtXp: 10 },
          operator: { promotedAt: Date.parse("2026-05-02T10:00:00.000Z"), promotedAtXp: 60 },
          technician: { promotedAt: Date.parse("2026-05-03T10:00:00.000Z"), promotedAtXp: 240 },
          engineer: { promotedAt: Date.parse("2026-05-04T10:00:00.000Z"), promotedAtXp: 960 },
        }}
        rankThumbnailSrc=""
        canSelectRankInsignia={false}
        onSelectRankThumbnail={async () => {}}
      />
    );

    expect(html).toContain("You need 2,880 XP to be promoted to this rank");
  });
});
