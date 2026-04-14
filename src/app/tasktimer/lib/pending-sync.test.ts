import { describe, expect, it } from "vitest";
import {
  filterPendingSyncEntries,
  PENDING_PREFERENCES_SYNC_TTL_MS,
  PENDING_WORKSPACE_SYNC_TTL_MS,
} from "./pending-sync";

describe("pending-sync retention", () => {
  it("expires short-lived preference sync entries after the configured timeout", () => {
    const now = 1_000_000;
    expect(
      filterPendingSyncEntries(
        {
          recent: now - 60_000,
          expired: now - PENDING_PREFERENCES_SYNC_TTL_MS - 1,
        },
        now,
        PENDING_PREFERENCES_SYNC_TTL_MS
      )
    ).toEqual({ recent: now - 60_000 });
  });

  it("retains workspace sync markers far beyond the old five-minute window", () => {
    const now = 10_000_000;
    const tenMinutesAgo = now - 10 * 60 * 1000;
    expect(
      filterPendingSyncEntries(
        {
          historyTask: tenMinutesAgo,
        },
        now,
        PENDING_WORKSPACE_SYNC_TTL_MS
      )
    ).toEqual({ historyTask: tenMinutesAgo });
  });
});
