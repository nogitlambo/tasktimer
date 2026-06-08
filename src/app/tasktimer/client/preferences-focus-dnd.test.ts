import { describe, expect, it, vi } from "vitest";
import { reconcileFocusDndAccessRequestForSettings } from "./preferences";

function createHarness(statuses: Array<{ supported: boolean; policyAccessGranted: boolean } | null>) {
  const calls: string[] = [];
  const queue = statuses.slice();
  return {
    calls,
    getStatus: vi.fn(async () => queue.shift() ?? null),
    requestAccess: vi.fn(async () => {
      calls.push("request");
    }),
    waitForReturn: vi.fn(async () => {
      calls.push("wait");
    }),
    setEnabled: vi.fn((enabled: boolean) => {
      calls.push(`enabled:${enabled}`);
    }),
    syncUi: vi.fn(async () => {
      calls.push("sync");
    }),
    setDeniedMessage: vi.fn(() => {
      calls.push("denied-message");
    }),
  };
}

describe("reconcileFocusDndAccessRequestForSettings", () => {
  it("keeps the preference on when DND access is already granted", async () => {
    const harness = createHarness([{ supported: true, policyAccessGranted: true }]);

    await reconcileFocusDndAccessRequestForSettings(harness);

    expect(harness.requestAccess).not.toHaveBeenCalled();
    expect(harness.setEnabled).not.toHaveBeenCalled();
    expect(harness.calls).toEqual(["sync"]);
  });

  it("requests DND access and reverts the preference when access is still missing on return", async () => {
    const harness = createHarness([
      { supported: true, policyAccessGranted: false },
      { supported: true, policyAccessGranted: false },
    ]);

    await reconcileFocusDndAccessRequestForSettings(harness);

    expect(harness.calls).toEqual(["wait", "request", "enabled:false", "sync", "denied-message"]);
  });

  it("requests DND access and keeps the preference enabled when access is granted on return", async () => {
    const harness = createHarness([
      { supported: true, policyAccessGranted: false },
      { supported: true, policyAccessGranted: true },
    ]);

    await reconcileFocusDndAccessRequestForSettings(harness);

    expect(harness.setEnabled).not.toHaveBeenCalled();
    expect(harness.setDeniedMessage).not.toHaveBeenCalled();
    expect(harness.calls).toEqual(["wait", "request", "sync"]);
  });
});
