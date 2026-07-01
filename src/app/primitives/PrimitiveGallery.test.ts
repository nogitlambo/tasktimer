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
    expect(html).toContain('class="btn btn-accent"');
    expect(html).toContain('class="iconBtn"');
    expect(html).toContain("primitiveLaunchButton");
    expect(html).toContain("primitiveLaunchButtonImage");
    expect(html).toContain("/launch_button.png");
    expect(html).toContain('class="switch on"');
    expect(html).toContain("modalSubtext");
    expect(html).toContain("modalDropdownField");
    expect(html).toContain("modalDropdownButton");
    expect(html).toContain("modalDropdownList");
    expect(html).toContain("modalDropdownOption");
    expect(html).toContain("modalCheckboxRow");
    expect(html).toContain("modalCheckboxText");
    expect(html).toContain("modalDropdownHelp");
    expect(html).toContain("confirmBtns");
    expect(html).toContain("dashboardCard");
    expect(html).toContain("--accent");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("modalPreviewDropdown");
    expect(html).not.toContain("modalPreviewCheckbox");
  });
});
