import { describe, expect, it } from "vitest";

import { dismissCloudSyncNotice, renderCloudSyncNotice } from "./cloud-sync-notice";

function createHost() {
  const classes = new Set<string>();
  return {
    innerHTML: "",
    classList: {
      add: (className: string) => classes.add(className),
      remove: (className: string) => classes.delete(className),
      contains: (className: string) => classes.has(className),
    },
  } as unknown as HTMLElement;
}

describe("cloud sync notice", () => {
  it("renders a reportable log ID and dismiss action", () => {
    const host = createHost();

    renderCloudSyncNotice(host, {
      message: "Account sync is temporarily limited. Your task was saved locally and will retry later.",
      logId: "acct-sync-ABC123",
    });

    expect(host.classList.contains("isActive")).toBe(true);
    expect(host.innerHTML).toContain("Account sync is temporarily limited");
    expect(host.innerHTML).toContain("Log ID:");
    expect(host.innerHTML).toContain("acct-sync-ABC123");
    expect(host.innerHTML).toContain('data-action="copyCloudSyncLogId"');
    expect(host.innerHTML).toContain('aria-label="Copy Log ID"');
    expect(host.innerHTML).toContain('data-action="dismissCloudSyncNotice"');

    dismissCloudSyncNotice(host);

    expect(host.classList.contains("isActive")).toBe(false);
    expect(host.innerHTML).toBe("");
  });
});
