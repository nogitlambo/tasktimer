import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ArchieResponseActionRow,
  nextArchieResponseFeedback,
  shouldShowArchieResponseActionRow,
} from "./ArchieAssistantWidget";

describe("ArchieAssistantWidget response actions", () => {
  it("renders the Archie response action row with thumb and copy controls", () => {
    const markup = renderToStaticMarkup(
      <ArchieResponseActionRow
        visible
        feedback="up"
        copyState="idle"
        onFeedback={vi.fn()}
        onCopy={vi.fn()}
      />
    );

    expect(markup).toContain("desktopRailMascotResponseActions isVisible");
    expect(markup).toContain('aria-label="Mark Archie response helpful"');
    expect(markup).toContain('aria-label="Mark Archie response unhelpful"');
    expect(markup).toContain('aria-label="Copy Archie response"');
  });

  it("toggles thumbs feedback as a mutually exclusive state", () => {
    expect(nextArchieResponseFeedback(null, "up")).toBe("up");
    expect(nextArchieResponseFeedback("up", "down")).toBe("down");
    expect(nextArchieResponseFeedback("down", "down")).toBeNull();
  });

  it("shows response actions only for completed Archie replies", () => {
    expect(
      shouldShowArchieResponseActionRow({
        busy: false,
        inputVisible: true,
        hasResponseActions: true,
        message: "Here is your Archie answer.",
      })
    ).toBe(true);
    expect(
      shouldShowArchieResponseActionRow({
        busy: true,
        inputVisible: true,
        hasResponseActions: true,
        message: "Thinking...",
      })
    ).toBe(false);
    expect(
      shouldShowArchieResponseActionRow({
        busy: false,
        inputVisible: false,
        hasResponseActions: true,
        message: "Partial response",
      })
    ).toBe(false);
    expect(
      shouldShowArchieResponseActionRow({
        busy: false,
        inputVisible: true,
        hasResponseActions: false,
        message: "What can I help with?",
      })
    ).toBe(false);
  });
});
