import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import FeedbackScreen from "./FeedbackScreen";

vi.mock("@/components/AppImg", () => ({
  default: (props: Record<string, unknown>) => createElement("img", props),
}));

vi.mock("@/lib/firebaseClient", () => ({
  getFirebaseAuthClient: () => null,
}));

vi.mock("@/lib/firebaseFirestoreClient", () => ({
  getFirebaseFirestoreClient: () => null,
}));

vi.mock("./DesktopAppRail", () => ({
  default: () => createElement("div", { "data-testid": "desktop-app-rail" }),
}));

describe("FeedbackScreen", () => {
  it("renders the stable identity fields as readonly", () => {
    const html = renderToStaticMarkup(createElement(FeedbackScreen));

    expect(html).toContain('id="feedbackEmailInput"');
    expect(html).toContain('id="feedbackUidInput"');
    expect(html).toContain("readOnly");
    expect(html).toContain('placeholder="User ID unavailable"');
    expect(html).not.toContain('id="feedbackEmailInput" type="email" placeholder="Account email unavailable" autoComplete="email" value="" disabled');
  });

  it("renders the canonical wordmark without a duplicate text lockup", () => {
    const html = renderToStaticMarkup(createElement(FeedbackScreen));

    expect(html).toContain('src="/logo/tasklaunch-logo-main.png"');
    expect(html).toContain('alt="TaskLaunch"');
    expect(html).not.toContain("appBrandLandingReplicaText");
  });
});
