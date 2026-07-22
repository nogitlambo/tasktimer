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
    expect(html).toContain("primitiveSciFiModalPrimaryAction");
    expect(html).toContain("primitiveSciFiModalSecondaryAction");
    expect(html).not.toContain("Open Modal Preview");
    expect(html).toContain("dashboardCard");
    expect(html).toContain("--accent");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("standardModalOverlay");
    expect(html).not.toContain("modalPreviewDropdown");
    expect(html).not.toContain("modalPreviewCheckbox");
  });

  it("keeps primitive secondary button hover neutral in the lime theme", () => {
    const css = readFileSync("src/app/primitives/primitives.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain(
      'body[data-theme="lime"] #app[aria-label="TaskLaunch Primitives"] .primitiveButtonGrid .btn-ghost:hover:not(:disabled)'
    );
    expect(css).toContain(
      'body[data-theme="lime"] #app.primitiveSurface .primitiveButtonGrid .btn-ghost:focus-visible'
    );
    expect(css).toContain("border-color: #020509 !important;");
    expect(css).toContain("color: rgba(238, 242, 246, .88) !important;");
  });
});
