import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import WebSignIn from "./webSign-in";

type ElementWithProps = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

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

function textContent(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (!isValidElement(node)) return "";
  return textContent((node as ElementWithProps).props.children);
}

function findElement(
  node: ReactNode,
  predicate: (node: ElementWithProps) => boolean
): ElementWithProps | null {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") {
    return null;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ElementWithProps;
  if (predicate(element)) return element;
  return findElement(element.props.children, predicate);
}

describe("WebSignIn", () => {
  it("renders continue without account after Google sign-in", () => {
    const html = renderToStaticMarkup(<WebSignIn {...baseProps} />);

    expect(html.indexOf("Continue with Google")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Continue without account")).toBeGreaterThan(html.indexOf("Continue with Google"));
    expect(html).toContain('href="/tasklaunch"');
  });

  it("omits the guest link for auth-only surfaces", () => {
    const html = renderToStaticMarkup(<WebSignIn {...baseProps} showGuestLink={false} />);

    expect(html).toContain("Continue with Google");
    expect(html).toContain("Continue with email");
    expect(html).not.toContain("Continue without account");
  });

  it("submits the visible email form through the send-link action", () => {
    const html = renderToStaticMarkup(
      <WebSignIn {...baseProps} showEmailLoginForm={true} isValidAuthEmail={true} authEmail="user@example.com" />
    );

    expect(html).toContain("<form");
    expect(html).toContain('type="email"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("webSignInEmailActions");
    expect(html).toContain("Cancel");
    expect(html).toContain("Send Link");
    expect(html).toContain("webSignInSendLinkButton");
  });

  it("sends the sign-in link from the primary email option once a valid email is entered", () => {
    const onSendEmailLink = vi.fn();
    const onToggleEmailLoginForm = vi.fn();
    const tree = (
      <WebSignIn
        {...baseProps}
        showEmailLoginForm={true}
        isValidAuthEmail={true}
        authEmail="user@example.com"
        onSendEmailLink={onSendEmailLink}
        onToggleEmailLoginForm={onToggleEmailLoginForm}
      />
    );
    const button = findElement(
      WebSignIn(tree.props),
      (node) => node.type === "button" && textContent(node).includes("Continue with email")
    );

    expect(button).not.toBeNull();
    expect(button?.props.onClick).toBeTypeOf("function");
    button?.props.onClick?.();

    expect(onSendEmailLink).toHaveBeenCalledTimes(1);
    expect(onToggleEmailLoginForm).not.toHaveBeenCalled();
  });
});
