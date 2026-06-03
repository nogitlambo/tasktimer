import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SignOutConfirmModal, { getSignOutConfirmActionLabel } from "./SignOutConfirmModal";

describe("SignOutConfirmModal", () => {
  it("renders standard modal baseline copy and controls", () => {
    const html = renderToStaticMarkup(
      createElement(SignOutConfirmModal, {
        open: true,
        busy: false,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      })
    );

    expect(html).toContain('class="overlay"');
    expect(html).toContain('id="signOutConfirmOverlay"');
    expect(html).toContain('style="display:flex"');
    expect(html).toContain('aria-hidden="false"');
    expect(html).toContain('class="modal"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Sign Out"');
    expect(html).toContain("<h2>Sign Out</h2>");
    expect(html).toContain("Sign out of TaskLaunch on this device?");
    expect(html).toContain('class="modalSubtext confirmText"');
    expect(html).toContain('class="confirmBtns"');
    expect(html).toContain('class="btn btn-ghost"');
    expect(html).toContain('class="btn btn-warn"');
  });

  it("uses the busy confirmation label", () => {
    expect(getSignOutConfirmActionLabel(false)).toBe("Sign Out");
    expect(getSignOutConfirmActionLabel(true)).toBe("Signing Out");
  });

  it("does not render while closed", () => {
    const html = renderToStaticMarkup(
      createElement(SignOutConfirmModal, {
        open: false,
        busy: false,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      })
    );

    expect(html).toBe("");
  });
});
