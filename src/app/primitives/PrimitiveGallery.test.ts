import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrimitiveGallery from "./PrimitiveGallery";

describe("PrimitiveGallery", () => {
  it("renders representative primitive sections and class contracts", () => {
    const html = renderToStaticMarkup(createElement(PrimitiveGallery));

    expect(html).toContain('aria-label="TaskLaunch Primitives"');
    expect(html).toContain("Design Primitives");
    expect(html).toContain("Typography");
    expect(html).toContain("Buttons");
    expect(html).toContain("Launch Button");
    expect(html).toContain("Modal Baseline");
    expect(html).toContain("Non-Destructive Confirmation Modal Baseline");
    expect(html).toContain("Destructive Confirmation Modal Baseline");
    expect(html).toContain("Dropdown Menus");
    expect(html).toContain("Switches And Checks");
    expect(html).toContain("btn btn-accent primitiveSciFiModalAction primitiveSciFiModalPrimaryAction");
    expect(html).not.toContain("primitiveDisabledButton");
    expect(html).toContain('class="iconBtn"');
    expect(html).toContain("taskPrimaryAction taskPrimaryActionLaunch");
    expect(html).toContain("taskPrimaryActionRing");
    expect(html).toContain("taskPrimaryActionFace");
    expect(html).toContain("taskPrimaryActionPrimary");
    expect(html).not.toContain("/launch_button.png");
    expect(html).toContain('class="switch on"');
    expect(html).toContain("modalSubtext");
    expect(html).toContain("modalDropdownField");
    expect(html).toContain("modalDropdownButton");
    expect(html).toContain("modalDropdownList");
    expect(html).toContain("modalDropdownOption");
    expect(html).toContain("modalCheckboxRow");
    expect(html).toContain("modalCheckboxText");
    expect(html).toContain("modalDropdownHelp");
    expect(html).toContain("primitiveSciFiModalOverlay");
    expect(html).toContain("primitiveSciFiModal");
    expect(html).toContain("primitiveSciFiModalHeader");
    expect(html).not.toContain("primitiveSciFiModalClose");
    expect(html).not.toContain("Close modal preview");
    expect(html).toContain("btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction");
    expect(html).toContain("btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction");
    expect(html).not.toContain("isDeleteFriendConfirm");
    expect(html).toContain('class="overlay primitiveLiveOverlay primitiveConfirmationModalOverlay"');
    expect(html).toContain('class="modal modalConfirmation"');
    expect(html).toContain('class="modal modalConfirmationDestructive"');
    expect(html).toContain("Confirm Title");
    expect(html).toContain("Confirm text confirms the action being requested.");
    expect(html).toContain('class="btn btn-accent primitiveConfirmationModalAction" type="button"');
    expect(html).toContain('class="btn btn-warn primitiveConfirmationModalAction" type="button"');
    expect(html).toContain("Secondary");
    expect(html).toContain("Primary");
    expect(html).toContain("Destructive");
    expect(html).not.toContain("Open Modal Preview");
    expect(html).toContain("dashboardCard");
    expect(html).toContain("--accent");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("standardModalOverlay");
    expect(html).not.toContain("modalPreviewDropdown");
    expect(html).not.toContain("modalPreviewCheckbox");
  });

  it("uses the shared global button primitive treatment", () => {
    const baseCss = readFileSync("src/app/tasktimer/styles/00-base.css", "utf8").replace(/\r\n/g, "\n");
    const primitiveCss = readFileSync("src/app/primitives/primitives.css", "utf8").replace(/\r\n/g, "\n");

    const primitiveButtonRule = baseCss.match(/\.btn\{[\s\S]*?\n\}/)?.[0] || "";
    const primitiveButtonHoverRule = baseCss.match(/\.btn:hover:not\(:disabled\),[\s\S]*?\n\}/)?.[0] || "";
    const primitivePrimaryButtonRule = baseCss.match(/\.btn-accent\{[\s\S]*?\n\}/)?.[0] || "";
    const primitivePrimaryButtonHoverRule = baseCss.match(/\.btn-accent:hover:not\(:disabled\),[\s\S]*?\n\}/)?.[0] || "";
    const primitiveDestructiveButtonRule = baseCss.match(/\.btn-warn\{[\s\S]*?\n\}/)?.[0] || "";
    const primitiveDestructiveButtonHoverRule = baseCss.match(/\.btn-warn:hover:not\(:disabled\),[\s\S]*?\n\}/)?.[0] || "";
    const primitiveSmallButtonRule = baseCss.match(/\.btn\.small\{[\s\S]*?\n\}/)?.[0] || "";

    expect(primitiveButtonRule).toContain("min-width: min(178px, 38vw);");
    expect(primitiveButtonRule).toContain("min-height: 48px;");
    expect(primitiveButtonRule).toContain("padding: 0 28px !important;");
    expect(primitiveButtonRule).toContain("border: 1px solid rgba(247, 248, 251, 0.58) !important;");
    expect(primitiveButtonRule).toContain("background: rgba(8, 9, 10, 0.58) !important;");
    expect(primitiveButtonRule).toContain("color: #f7f8fb !important;");
    expect(primitiveButtonRule).toContain("font-size: 13px !important;");
    expect(primitiveButtonRule).toContain("text-transform: none !important;");
    expect(primitiveButtonHoverRule).toContain("border-color: rgba(201, 255, 36, 0.9) !important;");
    expect(primitiveButtonHoverRule).toContain("background: rgba(13, 19, 25, 0.82) !important;");
    expect(primitivePrimaryButtonRule).toContain("border-color: #c9ff24 !important;");
    expect(primitivePrimaryButtonRule).toContain("linear-gradient(180deg, #e2ff72 0%, #c9ff24 48%, #94c900 100%) !important;");
    expect(primitivePrimaryButtonRule).toContain("color: #000 !important;");
    expect(primitivePrimaryButtonRule).toContain("text-shadow: none;");
    expect(primitivePrimaryButtonHoverRule).toContain("linear-gradient(180deg, #edff95 0%, #d4ff3d 48%, #a6df00 100%) !important;");
    expect(primitivePrimaryButtonHoverRule).toContain("color: #000 !important;");
    expect(primitiveDestructiveButtonRule).toContain("border-color: #ff4d4d !important;");
    expect(primitiveDestructiveButtonRule).toContain("linear-gradient(180deg, #ff8a8a 0%, #ff4d4d 48%, #b91515 100%) !important;");
    expect(primitiveDestructiveButtonRule).toContain("color: #fff !important;");
    expect(primitiveDestructiveButtonRule).toContain("text-shadow: none;");
    expect(primitiveDestructiveButtonHoverRule).toContain("linear-gradient(180deg, #ffaaaa 0%, #ff6262 48%, #d31d1d 100%) !important;");
    expect(primitiveDestructiveButtonHoverRule).toContain("color: #fff !important;");
    expect(primitiveSmallButtonRule).toContain("min-width: 0;");
    expect(primitiveSmallButtonRule).toContain("min-height: 0;");
    expect(primitiveSmallButtonRule).toContain("padding: 8px 10px !important;");
    expect(primitiveCss).toContain(".primitiveConfirmationModalAction");
    expect(primitiveCss).toContain(".primitiveConfirmationModalAction:is(.btn-accent, .btn-ghost, .btn-warn)");
    expect(primitiveCss).toContain("height: 48px !important;");
    expect(primitiveCss).toContain("max-height: 48px;");
    expect(primitiveCss).toContain("border-radius: 8px !important;");
    expect(primitiveCss).not.toContain(".primitiveButtonGrid .btn-accent{");
    expect(primitiveCss).not.toContain(".primitiveButtonGrid .btn-warn{");
  });

  it("applies slightly curved corners to the primitive shared card", () => {
    const css = readFileSync("src/app/primitives/primitives.css", "utf8").replace(/\r\n/g, "\n");

    const sharedCardRule = css.match(
      /:where\(#app\[aria-label="TaskLaunch Primitives"\], #app\.primitiveSurface\) \.primitiveDashboardCard\{[\s\S]*?\n\}/
    )?.[0] || "";

    expect(sharedCardRule).toContain("border-radius: 6px;");
  });

  it("keeps destructive and non-destructive confirmation previews the same width", () => {
    const css = readFileSync("src/app/primitives/primitives.css", "utf8").replace(/\r\n/g, "\n");

    const confirmationModalRule =
      css.match(
        /:where\(#app\[aria-label="TaskLaunch Primitives"\], #app\.primitiveSurface\) :is\(\.modalConfirmation, \.modalConfirmationDestructive\)\{[\s\S]*?\n\}/
      )?.[0] || "";
    const confirmationButtonRule =
      css.match(
        /:where\(#app\[aria-label="TaskLaunch Primitives"\], #app\.primitiveSurface\) \.primitiveConfirmationModalPreviewPanel \.primitiveConfirmationModalAction\{[\s\S]*?\n\}/
      )?.[0] || "";
    const confirmationTextRule =
      css.match(
        /:where\(#app\[aria-label="TaskLaunch Primitives"\], #app\.primitiveSurface\) \.primitiveConfirmationModalPreviewPanel \.confirmText\{[\s\S]*?\n\}/
      )?.[0] || "";
    const confirmationButtonRowRule =
      css.match(
        /:where\(#app\[aria-label="TaskLaunch Primitives"\], #app\.primitiveSurface\) \.primitiveConfirmationModalPreviewPanel \.confirmBtns\{[\s\S]*?\n\}/
      )?.[0] || "";
    const confirmationPreviewModalRadiusRule =
      css.match(
        /#app\[aria-label="TaskLaunch Primitives"\] \.primitiveConfirmationModalPreviewPanel :is\(\.modalConfirmation, \.modalConfirmationDestructive\),[\s\S]*?\n\}/
      )?.[0] || "";
    const confirmationPreviewButtonRadiusRule =
      css.match(
        /#app\[aria-label="TaskLaunch Primitives"\] \.primitiveConfirmationModalPreviewPanel \.primitiveConfirmationModalAction,[\s\S]*?\n\}/
      )?.[0] || "";

    expect(confirmationModalRule).toContain("width: min(420px, 100%);");
    expect(confirmationModalRule).toContain("border-color: rgba(86, 90, 98, .86) !important;");
    expect(confirmationModalRule).toContain("linear-gradient(180deg, rgba(28, 30, 36, .98) 0%, rgba(13, 15, 19, .98) 100%) !important;");
    expect(confirmationButtonRule).toContain("border-radius: 8px !important;");
    expect(confirmationTextRule).toContain("padding-block: 16px;");
    expect(confirmationButtonRowRule).toContain("justify-content: center !important;");
    expect(confirmationPreviewModalRadiusRule).toContain("border-radius: 8px !important;");
    expect(confirmationPreviewButtonRadiusRule).toContain("border-radius: 8px !important;");
  });
});
