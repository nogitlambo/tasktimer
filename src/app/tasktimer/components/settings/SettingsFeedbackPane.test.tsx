import { describe, expect, it, vi } from "vitest";
import { SettingsFeedbackPane } from "./SettingsFeedbackPane";

function findElementById(node: unknown, id: string): { props?: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null;
  const candidate = node as { props?: Record<string, unknown> };
  if (candidate.props?.id === id) return candidate;
  const children = candidate.props?.children;
  const childList = Array.isArray(children) ? children : [children];
  for (const child of childList) {
    const found = findElementById(child, id);
    if (found) return found;
  }
  return null;
}

describe("SettingsFeedbackPane", () => {
  it("wires the stable feedback button to the submit callback", () => {
    const onSubmitFeedback = vi.fn();
    const element = SettingsFeedbackPane({
      active: true,
      feedback: {
        email: "pilot@example.com",
        anonymous: false,
        type: "bug",
        details: "Native feedback submission fails.",
      },
      setFeedback: vi.fn(),
      canSubmitFeedback: true,
      onSubmitFeedback,
    });

    const button = findElementById(element, "feedbackBtn");

    expect(button?.props?.type).toBe("button");
    expect(button?.props?.disabled).toBe(false);
    expect(button?.props?.onClick).toBe(onSubmitFeedback);
  });
});
