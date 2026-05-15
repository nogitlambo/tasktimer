import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import WebSignIn from "./webSign-in";

const baseProps = {
  authUserEmail: null,
  showEmailLoginForm: false,
  isEmailLinkFlow: false,
  isValidAuthEmail: false,
  authEmail: "",
  authStatus: "",
  authError: "",
  authBusy: false,
  showLaunchingScreen: false,
  onToggleEmailLoginForm: vi.fn(),
  onGoogleSignIn: vi.fn(),
  onSendEmailLink: vi.fn(),
  onCompleteEmailLink: vi.fn(),
  onAuthEmailChange: vi.fn(),
};

describe("WebSignIn", () => {
  it("renders continue without account after Google sign-in", () => {
    const html = renderToStaticMarkup(<WebSignIn {...baseProps} />);

    expect(html.indexOf("Continue with Google")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Continue without account")).toBeGreaterThan(html.indexOf("Continue with Google"));
    expect(html).toContain('href="/tasklaunch"');
  });
});
