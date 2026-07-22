"use client";

import AppImg from "@/components/AppImg";
import { useState } from "react";

type PrimitiveSectionProps = {
  title: string;
  note: string;
  code: string;
  children: React.ReactNode;
  exampleClassName?: string;
};

const TOKEN_SWATCHES = [
  { name: "--bg", value: "#0d0f13" },
  { name: "--panel", value: "#1a1b20" },
  { name: "--card", value: "#111216" },
  { name: "--text", value: "#e9eef9" },
  { name: "--accent", value: "#c9ff24" },
  { name: "--accent2", value: "#7ef3ff" },
  { name: "--accent3", value: "#a8a7a7" },
  { name: "--warn", value: "#ff4d4d" },
];

function PrimitiveSection({ title, note, code, children, exampleClassName = "" }: PrimitiveSectionProps) {
  return (
    <section className="primitiveSection" aria-labelledby={`primitive-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <div className="primitiveSectionHeader">
        <div>
          <h2 id={`primitive-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{title}</h2>
          <p className="modalSubtext">{note}</p>
        </div>
      </div>
      <div className={`primitiveExamplePanel${exampleClassName ? ` ${exampleClassName}` : ""}`}>{children}</div>
      <pre className="primitiveCode" tabIndex={0}>
        <code>{code}</code>
      </pre>
    </section>
  );
}

export default function PrimitiveGallery() {
  const [switchOn, setSwitchOn] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownValue, setDropdownValue] = useState("standard");

  const dropdownOptions = [
    { value: "standard", label: "Standard option" },
    { value: "secondary", label: "Secondary option" },
    { value: "disabled", label: "Unavailable option" },
  ];
  const selectedDropdownOption = dropdownOptions.find((option) => option.value === dropdownValue) ?? dropdownOptions[0];

  function renderModalDropdown(ids: { button: string; list: string }) {
    return (
      <div className="field modalDropdownField">
        <label htmlFor={ids.button}>Dropdown label</label>
        <p className="modalDropdownHelp">Helper text describes how this dropdown affects the action.</p>
        <div className="modalDropdown">
          <button
            className="modalDropdownButton"
            id={ids.button}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            aria-controls={ids.list}
            onClick={() => setDropdownOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDropdownOpen(false);
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setDropdownOpen((open) => !open);
              }
            }}
          >
            <span>{selectedDropdownOption.label}</span>
            <span aria-hidden="true">v</span>
          </button>
          {dropdownOpen ? (
            <div className="modalDropdownList" id={ids.list} role="listbox" aria-labelledby={ids.button}>
              {dropdownOptions.map((option) => {
                const selected = option.value === dropdownValue;
                return (
                  <button
                    className={`modalDropdownOption${selected ? " isSelected" : ""}`}
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setDropdownValue(option.value);
                      setDropdownOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main id="app" className="primitiveGallery" aria-label="TaskLaunch Primitives">
      <div className="primitiveShell">
        <header className="primitiveHero">
          <div>
            <p className="primitiveEyebrow displayFont">TaskLaunch Internal</p>
            <h1 className="displayFont">Design Primitives</h1>
            <p className="modalSubtext">
              Live reference for shared classes, states, and markup contracts used across the app.
            </p>
          </div>
          <a className="btn btn-ghost small" href="/dashboard">
            Back to Dashboard
          </a>
        </header>

        <PrimitiveSection
          title="Typography"
          note="Use existing font utility classes and inherited app font tokens before adding route-specific text styling."
          code={`<h1 className="displayFont">Display heading</h1>\n<p className="modalSubtext">Supporting copy</p>`}
        >
          <div className="primitiveTypeStack">
            <h3 className="displayFont primitiveDisplaySample">Display Heading</h3>
            <p className="dashboardCardTitle">Dashboard Card Title</p>
            <p className="modalSubtext">Modal subtext and explanatory copy use the shared app text treatment.</p>
            <p className="confirmText">Confirm text is for compact explanatory content inside modal flows.</p>
          </div>
        </PrimitiveSection>

        <PrimitiveSection
          title="Buttons"
          note="Compose button intent with the shared `btn` base and intent/size modifiers."
          code={`<button className="btn btn-accent primitiveSciFiModalAction primitiveSciFiModalPrimaryAction" type="button">Primary</button>\n<button className="btn btn-ghost" type="button">Secondary</button>\n<button className="btn btn-warn" type="button">Destructive</button>`}
        >
          <div className="primitiveInlineGrid primitiveButtonGrid">
            <button className="btn btn-accent primitiveSciFiModalAction primitiveSciFiModalPrimaryAction" type="button">
              Primary
            </button>
            <button className="btn btn-ghost" type="button">
              Secondary
            </button>
            <button className="btn btn-warn" type="button">
              Destructive
            </button>
          </div>
        </PrimitiveSection>

        <PrimitiveSection
          title="Icon Button"
          note="Use `iconBtn` for compact icon-only actions and provide a clear accessible name."
          code={`<button className="iconBtn" type="button" aria-label="Close">x</button>`}
        >
          <div className="primitiveInlineGrid primitiveIconRow">
            <button className="iconBtn" type="button" aria-label="Close example">
              x
            </button>
            <button className="iconBtn" type="button" aria-label="Previous example">
              &lt;
            </button>
            <button className="iconBtn" type="button" aria-label="Next example">
              &gt;
            </button>
          </div>
        </PrimitiveSection>

        <PrimitiveSection
          title="Launch Button"
          note="Use the current Task launch action for primary task starts, preserving the same nested ring, face, and label structure."
          code={`<button className="btn btn-accent small taskPrimaryAction taskPrimaryActionLaunch" data-action="start" title="Launch" aria-label="Launch" type="button">\n  <span className="taskPrimaryActionRing" aria-hidden="true"></span>\n  <span className="taskPrimaryActionFace">\n    <span className="taskPrimaryActionLabel">\n      <span className="taskPrimaryActionText">\n        <span className="taskPrimaryActionPrimary">Launch</span>\n      </span>\n    </span>\n  </span>\n</button>`}
          exampleClassName="primitiveLaunchExamplePanel"
        >
          <button
            className="btn btn-accent small taskPrimaryAction taskPrimaryActionLaunch primitiveTaskLaunchButton"
            data-action="start"
            title="Launch"
            aria-label="Launch"
            type="button"
          >
            <span className="taskPrimaryActionRing" aria-hidden="true"></span>
            <span className="taskPrimaryActionFace">
              <span className="taskPrimaryActionLabel">
                <span className="taskPrimaryActionText">
                  <span className="taskPrimaryActionPrimary">Launch</span>
                </span>
              </span>
            </span>
          </button>
        </PrimitiveSection>

        <PrimitiveSection
          title="Android splash"
          note="Use the production TaskLaunch logo asset when previewing Android splash screen treatments."
          code={`<AppImg className="primitiveAndroidSplashLogo" src="/logo/logo_main.png" alt="TaskLaunch logo" />`}
          exampleClassName="primitiveAndroidSplashPanel"
        >
          <AppImg className="primitiveAndroidSplashLogo" src="/logo/logo_main.png" alt="TaskLaunch logo" />
        </PrimitiveSection>

        <PrimitiveSection
          title="Modal Baseline"
          note="The primitives modal preview uses an isolated visual shell while preserving the expected dialog, helper text, and action patterns."
          code={`<div className="overlay primitiveLiveOverlay primitiveSciFiModalOverlay" style={{ display: "flex" }}>\n  <div className="primitiveSciFiModal" role="dialog" aria-modal="true" aria-label="Primitive modal example">\n    <header className="primitiveSciFiModalHeader">\n      <h2>Modal Preview</h2>\n    </header>\n    <div className="primitiveSciFiModalBody">\n      <p className="modalSubtext">Standard modal helper text.</p>\n    </div>\n    <footer className="primitiveSciFiModalFooter">\n      <button className="primitiveSciFiModalAction primitiveSciFiModalSecondaryAction">Secondary</button>\n      <button className="primitiveSciFiModalAction primitiveSciFiModalPrimaryAction">Primary</button>\n    </footer>\n  </div>\n</div>`}
          exampleClassName="primitiveModalPreviewPanel"
        >
          <div className="overlay primitiveLiveOverlay primitiveSciFiModalOverlay" style={{ display: "flex" }}>
            <div className="primitiveSciFiModal" role="dialog" aria-modal="true" aria-label="Primitive modal example">
              <header className="primitiveSciFiModalHeader">
                <h2>Modal Preview</h2>
              </header>
              <div className="primitiveSciFiModalBody">
                <p className="modalSubtext">
                  This modal uses the standard TaskLaunch modal styling baseline.
                </p>
              </div>
              <footer className="primitiveSciFiModalFooter">
                <button className="primitiveSciFiModalAction primitiveSciFiModalSecondaryAction" type="button">
                  Secondary
                </button>
                <button className="primitiveSciFiModalAction primitiveSciFiModalPrimaryAction" type="button">
                  Primary
                </button>
              </footer>
            </div>
          </div>
        </PrimitiveSection>

        <PrimitiveSection
          title="Dropdown Menus"
          note="Use the standard modal dropdown classes for custom listbox menus inside modal flows."
          code={`<div className="field modalDropdownField">\n  <label htmlFor="exampleDropdown">Dropdown label</label>\n  <p className="modalDropdownHelp">Helper text.</p>\n  <div className="modalDropdown">\n    <button className="modalDropdownButton" type="button" aria-haspopup="listbox">...</button>\n    <div className="modalDropdownList" role="listbox">\n      <button className="modalDropdownOption isSelected" role="option">Standard option</button>\n    </div>\n  </div>\n</div>`}
        >
          {renderModalDropdown({ button: "primitiveGalleryDropdown", list: "primitiveGalleryDropdownList" })}
        </PrimitiveSection>

        <PrimitiveSection
          title="Switches And Checks"
          note="Reuse the app switch dimensions and the modal baseline checkbox row for binary settings."
          code={`<div className="chkRow modalCheckboxRow">\n  <button className={enabled ? "switch on" : "switch"} type="button" role="switch" aria-checked={enabled} />\n  <div className="modalCheckboxText">\n    <label>Toggle row label</label>\n    <p className="modalDropdownHelp">Description explains the setting.</p>\n  </div>\n</div>\n<div className="chkRow modalCheckboxRow">\n  <input id="exampleCheckbox" type="checkbox" />\n  <div className="modalCheckboxText">\n    <label htmlFor="exampleCheckbox">Checkbox row label</label>\n  </div>\n</div>`}
        >
          <div className="primitiveControlStack">
            <div className="chkRow modalCheckboxRow primitiveControlRow">
              <button
                id="primitiveSwitchRow"
                className={`switch${switchOn ? " on" : ""}`}
                type="button"
                role="switch"
                aria-checked={switchOn}
                aria-label="Toggle enabled setting example"
                onClick={() => setSwitchOn((value) => !value)}
              />
              <div className="modalCheckboxText">
                <label htmlFor="primitiveSwitchRow">Toggle row label</label>
                <p className="modalDropdownHelp">Description explains the switch setting.</p>
              </div>
            </div>
            <div className="chkRow modalCheckboxRow primitiveCheckRow">
              <input id="primitiveCheckboxRow" type="checkbox" defaultChecked />
              <div className="modalCheckboxText">
                <label htmlFor="primitiveCheckboxRow">Checkbox row label</label>
              </div>
            </div>
          </div>
        </PrimitiveSection>

        <PrimitiveSection
          title="Fields"
          note="Use `field` groupings with explicit labels and app-native input, textarea, and select styling."
          code={`<div className="field">\n  <label htmlFor="exampleInput">Field label</label>\n  <input id="exampleInput" placeholder="Placeholder" />\n</div>`}
        >
          <div className="primitiveFieldGrid">
            <div className="field primitiveField">
              <label htmlFor="primitiveGalleryInput">Text input</label>
              <input id="primitiveGalleryInput" placeholder="TaskLaunch value" />
            </div>
            <div className="field primitiveField">
              <label htmlFor="primitiveGalleryTextarea">Textarea</label>
              <textarea id="primitiveGalleryTextarea" placeholder="Longer note" rows={3} />
            </div>
          </div>
        </PrimitiveSection>

        <PrimitiveSection
          title="Cards And Notes"
          note="Use existing panel/card/note classes for grouped content and inline feedback before adding one-off containers."
          code={`<section className="dashboardCard">\n  <h3 className="dashboardCardTitle">Card title</h3>\n  <p className="modalSubtext">Card copy.</p>\n</section>\n<div className="settingsDetailNote">Status note</div>`}
        >
          <div className="primitiveCardGrid">
            <section className="dashboardCard primitiveDashboardCard" aria-label="Card example">
              <h3 className="dashboardCardTitle">Shared Card</h3>
              <p className="modalSubtext">A compact grouped panel using existing dashboard card treatment.</p>
            </section>
            <div className="settingsDetailNote" role="status">
              Status notes should be concise and placed near the related action.
            </div>
          </div>
        </PrimitiveSection>

        <PrimitiveSection
          title="Lime Theme Tokens"
          note="Use current app tokens for primitive color decisions and keep new controls aligned to the lime theme path."
          code={`color: var(--text);\nbackground: var(--bg);\nborder-color: var(--accent);`}
        >
          <div className="primitiveSwatchGrid">
            {TOKEN_SWATCHES.map((swatch) => (
              <div className="primitiveSwatch" key={swatch.name}>
                <span className="primitiveSwatchColor" style={{ background: swatch.value }} />
                <span className="primitiveSwatchName">{swatch.name}</span>
                <span className="primitiveSwatchValue">{swatch.value}</span>
              </div>
            ))}
          </div>
        </PrimitiveSection>
      </div>

    </main>
  );
}
