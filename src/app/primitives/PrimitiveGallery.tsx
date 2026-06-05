"use client";

import { useState } from "react";

type PrimitiveSectionProps = {
  title: string;
  note: string;
  code: string;
  children: React.ReactNode;
};

const TOKEN_SWATCHES = [
  { name: "--bg", value: "#0d0f13" },
  { name: "--panel", value: "#12182a" },
  { name: "--card", value: "#111a2b" },
  { name: "--text", value: "#e9eef9" },
  { name: "--accent", value: "#c9ff24" },
  { name: "--accent2", value: "#8ab600" },
  { name: "--accent3", value: "#efff86" },
  { name: "--warn", value: "#ff4d4d" },
];

function PrimitiveSection({ title, note, code, children }: PrimitiveSectionProps) {
  return (
    <section className="primitiveSection" aria-labelledby={`primitive-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <div className="primitiveSectionHeader">
        <div>
          <h2 id={`primitive-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{title}</h2>
          <p className="modalSubtext">{note}</p>
        </div>
      </div>
      <div className="primitiveExamplePanel">{children}</div>
      <pre className="primitiveCode" tabIndex={0}>
        <code>{code}</code>
      </pre>
    </section>
  );
}

export default function PrimitiveGallery() {
  const [switchOn, setSwitchOn] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
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
          code={`<button className="btn btn-accent" type="button">Primary</button>\n<button className="btn btn-ghost small" type="button">Secondary</button>\n<button className="btn btn-warn" type="button">Destructive</button>`}
        >
          <div className="primitiveInlineGrid">
            <button className="btn btn-accent" type="button">
              Primary
            </button>
            <button className="btn btn-ghost" type="button">
              Secondary
            </button>
            <button className="btn btn-warn" type="button">
              Destructive
            </button>
            <button className="btn btn-ghost small" type="button">
              Small
            </button>
            <button className="btn btn-accent" type="button" disabled>
              Disabled
            </button>
            <button className="btn btn-ghost isOn" type="button" aria-pressed="true">
              Selected
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
          title="Modal Baseline"
          note="Standard modals use the shared overlay/modal structure, modal helper text, dropdown, checkbox, and confirm action primitives."
          code={`<div className="overlay standardModalOverlay" style={{ display: "flex" }}>\n  <div className="modal" role="dialog" aria-modal="true" aria-label="Modal preview">\n    <h2>Modal Preview</h2>\n    <p className="modalSubtext">Standard modal helper text.</p>\n    <div className="field modalDropdownField">...</div>\n    <div className="chkRow modalCheckboxRow">\n      <input id="exampleCheckbox" type="checkbox" />\n      <div className="modalCheckboxText">...</div>\n    </div>\n    <div className="confirmBtns">...</div>\n  </div>\n</div>`}
        >
          <button className="btn btn-accent" type="button" onClick={() => setModalOpen(true)}>
            Open Modal Preview
          </button>
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
          note="Reuse the app switch dimensions and `chkRow` structure for binary settings."
          code={`<button className={enabled ? "switch on" : "switch"} type="button" aria-pressed={enabled} />\n<label className="chkRow"><input type="checkbox" /> Checkbox label</label>`}
        >
          <div className="primitiveControlStack">
            <div className="primitiveControlRow">
              <span>Enabled setting</span>
              <button
                className={`switch${switchOn ? " on" : ""}`}
                type="button"
                role="switch"
                aria-checked={switchOn}
                aria-label="Toggle enabled setting example"
                onClick={() => setSwitchOn((value) => !value)}
              />
            </div>
            <label className="chkRow primitiveCheckRow">
              <input type="checkbox" defaultChecked />
              <span>Checkbox row label</span>
            </label>
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

      {modalOpen ? (
        <div
          className="overlay standardModalOverlay primitiveLiveOverlay"
          style={{ display: "flex" }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Primitive modal example">
            <h2>Modal Preview</h2>
            <p className="modalSubtext">
              This modal uses the standard TaskLaunch modal styling baseline.
            </p>
            {renderModalDropdown({ button: "primitiveModalDropdown", list: "primitiveModalDropdownList" })}
            <div className="chkRow modalCheckboxRow">
              <input id="primitiveModalCheckbox" type="checkbox" />
              <div className="modalCheckboxText">
                <label htmlFor="primitiveModalCheckbox">Checkbox label</label>
                <p className="modalDropdownHelp">Description explains the checkbox setting.</p>
              </div>
            </div>
            <div className="confirmBtns">
              <button className="btn btn-ghost" type="button" onClick={() => setModalOpen(false)}>
                Secondary
              </button>
              <button className="btn btn-accent" type="button" onClick={() => setModalOpen(false)}>
                Primary
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
