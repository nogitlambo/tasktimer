import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConfirmOverlay from "./ConfirmOverlay";

describe("ConfirmOverlay", () => {
  it("renders the shared confirmation buttons with stable hooks", () => {
    const html = renderToStaticMarkup(<ConfirmOverlay />);

    expect(html).toContain('id="confirmOverlay"');
    expect(html).toContain('class="modal modalConfirmation"');
    expect(html).toContain('class="confirmBtns"');
    expect(html).toContain('class="btn btn-ghost" id="confirmCancelBtn"');
    expect(html).toContain('class="btn btn-ghost" id="confirmAltBtn"');
    expect(html).toContain('id="confirmAltBtn" type="button" hidden=""');
    expect(html).toContain('class="btn btn-accent" id="confirmOkBtn"');
  });

  it("keeps confirmation modal button chrome on the base button primitives", () => {
    const css = readFileSync(resolve(__dirname, "../styles/04-overlays.css"), "utf8").replace(/\r\n/g, "\n");
    const confirmationModalRule =
      css.match(/#confirmOverlay \.modal:is\(\.modalConfirmation, \.modalConfirmationDestructive\)\{[\s\S]*?\n\}/)?.[0] || "";
    const confirmationTextRule =
      css.match(/#confirmOverlay \.modal:is\(\.modalConfirmation, \.modalConfirmationDestructive\) \.confirmText\{[\s\S]*?\n\}/)?.[0] || "";
    const confirmationTextLinkRule =
      css.match(/#confirmOverlay \.modal:is\(\.modalConfirmation, \.modalConfirmationDestructive\) \.confirmText a\{[\s\S]*?\n\}/)?.[0] || "";
    const confirmationTextNoteRule =
      css.match(
        /#confirmOverlay \.modal:is\(\.modalConfirmation, \.modalConfirmationDestructive\) \.confirmText \.confirmTextNote\{[\s\S]*?\n\}/
      )?.[0] || "";
    const confirmationButtonRowRule =
      css.match(/#confirmOverlay \.modal:is\(\.modalConfirmation, \.modalConfirmationDestructive\) \.confirmBtns\{[\s\S]*?\n\}/)?.[0] || "";
    const confirmationButtonRule =
      css.match(/#confirmOverlay \.modal:is\(\.modalConfirmation, \.modalConfirmationDestructive\) \.confirmBtns \.btn\{[\s\S]*?\n\}/)?.[0] || "";

    expect(confirmationModalRule).toContain("width: min(420px, 100%) !important;");
    expect(confirmationModalRule).toContain("border: 1px solid rgba(86, 90, 98, .86) !important;");
    expect(confirmationModalRule).toContain("border-radius: 8px !important;");
    expect(confirmationModalRule).toContain("linear-gradient(180deg, rgba(28, 30, 36, .98) 0%, rgba(13, 15, 19, .98) 100%) !important;");
    expect(confirmationTextRule).toContain("padding: 16px 0 !important;");
    expect(confirmationTextLinkRule).toContain("color: #35e8ff !important;");
    expect(confirmationTextLinkRule).toContain("text-decoration: underline !important;");
    expect(confirmationTextNoteRule).toContain("color: rgba(170, 178, 190, .86) !important;");
    expect(confirmationTextNoteRule).toContain("font-style: italic !important;");
    expect(confirmationButtonRowRule).toContain("justify-content: center !important;");
    expect(confirmationButtonRule).toContain("border-radius: 8px !important;");
    expect(confirmationButtonRule).toContain("height: 48px !important;");
    expect(confirmationButtonRule).toContain("max-height: 48px !important;");
    expect(css).toContain(':is(#confirmOverlay, #signOutConfirmOverlay) .modal .confirmBtns .btn[hidden]');
    expect(css).not.toContain(":is(#confirmOverlay, #signOutConfirmOverlay) .modal .confirmBtns .btn-accent{");
    expect(css).not.toContain(":is(#confirmOverlay, #signOutConfirmOverlay) .modal .confirmBtns .btn-warn{");
    expect(css).not.toContain("#confirmOverlay.isResetTaskConfirm .modal.modalConfirmation .confirmBtns #confirmOkBtn.btn-accent");
    expect(css).not.toContain("#confirmOverlay.isArchiveTaskConfirm .modal.modalConfirmation .confirmBtns #confirmOkBtn.btn-accent");
    expect(css).not.toContain("#confirmOverlay.isDeleteTaskConfirm .modal.modalConfirmation .confirmBtns #confirmOkBtn.btn-warn");
  });
});
