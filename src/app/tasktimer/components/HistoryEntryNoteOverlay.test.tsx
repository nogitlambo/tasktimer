import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HistoryEntryNoteOverlay from "./HistoryEntryNoteOverlay";

describe("HistoryEntryNoteOverlay", () => {
  it("renders the session summary header close icon and keeps stable note action ids", () => {
    const html = renderToStaticMarkup(<HistoryEntryNoteOverlay />);

    expect(html).toContain('id="historyEntryNoteOverlay"');
    expect(html).toContain('class="iconBtn closePopup historyEntrySummaryCloseIcon"');
    expect(html).toContain('aria-label="Close session summary"');
    expect(html).toContain('id="historyEntryNoteCloseBtn"');
    expect(html).toContain('id="historyEntryNoteCancelBtn"');
    expect(html).toContain('id="historyEntryNoteSaveBtn"');
    expect(html).toContain('id="historyEntryNoteSaveAndCloseBtn"');
  });

  it("renders the footer close button label for web and desktop", () => {
    const html = renderToStaticMarkup(<HistoryEntryNoteOverlay />);

    expect(html).toContain(">Close<");
  });
});
