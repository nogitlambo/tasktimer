import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DeleteAccountConfirmActions } from "./DeleteAccountConfirmActions";

describe("DeleteAccountConfirmActions", () => {
  it("renders cancel and delete controls when deletion is not busy", () => {
    const html = renderToStaticMarkup(
      <DeleteAccountConfirmActions authBusy={false} className="footerBtns settingsInlineConfirmBtns" onCancel={vi.fn()} onDelete={vi.fn()} />
    );

    expect(html).toContain(">Cancel<");
    expect(html).toContain(">Delete (5)<");
    expect(html).not.toContain("Deleting account...");
    expect(html).not.toContain('role="status"');
  });

  it("renders only the busy status while deletion is running", () => {
    const html = renderToStaticMarkup(
      <DeleteAccountConfirmActions authBusy={true} className="footerBtns settingsInlineConfirmBtns" onCancel={vi.fn()} onDelete={vi.fn()} />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Deleting account...");
    expect(html).toContain("deleteAccountBusyRing");
    expect(html).not.toContain("<button");
    expect(html).not.toContain(">Cancel<");
    expect(html).not.toContain(">Delete<");
    expect(html).not.toContain(">Delete (5)<");
  });
});
