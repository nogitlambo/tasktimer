import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { USED_OR_EXPIRED_EMAIL_LINK_MESSAGE } from "./auth/emailLinkSignInError";
import WebSignIn from "./webSign-in";

type ElementWithProps = ReactElement<
  HTMLAttributes<HTMLElement> &
    ButtonHTMLAttributes<HTMLButtonElement> & {
      children?: ReactNode;
    }
>;

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
  onAuthEmailFocus: vi.fn(),
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

const testEvent = {} as never;

describe("WebSignIn", () => {
  it("renders only Google and email sign-in options", () => {
    const html = renderToStaticMarkup(<WebSignIn {...baseProps} />);

    expect(html.indexOf("Continue with Google")).toBeGreaterThanOrEqual(0);
    expect(html).toContain("Continue with email");
    expect(html).not.toContain("Continue without account");
    expect(html).not.toContain("Guest account");
    expect(html).not.toContain('href="/tasklaunch"');
  });

  it("submits the visible email form through the send-link action", () => {
    const onSendEmailLink = vi.fn();
    const tree = (
      <WebSignIn
        {...baseProps}
        showEmailLoginForm={true}
        isValidAuthEmail={true}
        authEmail="user@example.com"
        onSendEmailLink={onSendEmailLink}
      />
    );
    const html = renderToStaticMarkup(tree);
    const rendered = WebSignIn(tree.props);
    const transitionStack = findElement(rendered, (node) =>
      String(node.props.className || "").includes("webSignInAuthTransitionStack")
    );
    const continueButton = findElement(
      rendered,
      (node) => node.type === "button" && textContent(node).includes("Continue with email")
    );
    const sendButton = findElement(
      rendered,
      (node) => node.type === "button" && textContent(node).includes("Send Link")
    );

    expect(html).toContain("<form");
    expect(html).toContain('id="landingEmailInput"');
    expect(html).toContain('type="email"');
    expect(html).toContain("webSignInEmailActions");
    expect(html).toContain("Cancel");
    expect(html).toContain("Send Link");
    expect(html).toContain("webSignInSendLinkButton");
    expect(transitionStack?.props.className).toContain("isEmailMode");
    expect(continueButton?.props.disabled).toBe(true);
    expect(continueButton?.props.tabIndex).toBe(-1);
    expect(sendButton?.props.disabled).toBe(false);
    expect(sendButton?.props.tabIndex).toBeUndefined();
    sendButton?.props.onClick?.(testEvent);
    expect(onSendEmailLink).toHaveBeenCalledTimes(1);
  });

  it("keeps email controls mounted but inert before email mode is selected", () => {
    const tree = <WebSignIn {...baseProps} showEmailLoginForm={false} isValidAuthEmail={true} />;
    const rendered = WebSignIn(tree.props);
    const input = findElement(rendered, (node) => node.type === "input" && node.props.id === "landingEmailInput");
    const cancelButton = findElement(
      rendered,
      (node) => node.type === "button" && textContent(node).includes("Cancel")
    );
    const sendButton = findElement(
      rendered,
      (node) => node.type === "button" && textContent(node).includes("Send Link")
    );

    expect(input?.props.disabled).toBe(true);
    expect(input?.props.tabIndex).toBe(-1);
    expect(cancelButton?.props.disabled).toBe(true);
    expect(cancelButton?.props.tabIndex).toBe(-1);
    expect(sendButton?.props.disabled).toBe(true);
    expect(sendButton?.props.tabIndex).toBe(-1);
  });

  it("clears helper text when the email input receives focus", () => {
    const onAuthEmailFocus = vi.fn();
    const tree = (
      <WebSignIn
        {...baseProps}
        showEmailLoginForm={true}
        authStatus="Sign-in link sent."
        authError="Please enter a valid email address."
        onAuthEmailFocus={onAuthEmailFocus}
      />
    );
    const input = findElement(
      WebSignIn(tree.props),
      (node) => node.type === "input" && node.props.id === "landingEmailInput"
    );

    expect(input?.props.onFocus).toBeTypeOf("function");
    input?.props.onFocus?.(testEvent);
    input?.props.onClick?.(testEvent);
    input?.props.onPointerDown?.(testEvent);

    expect(onAuthEmailFocus).toHaveBeenCalledTimes(3);
  });

  it("opens the email form from the primary email option", () => {
    const onSendEmailLink = vi.fn();
    const onToggleEmailLoginForm = vi.fn();
    const tree = (
      <WebSignIn
        {...baseProps}
        showEmailLoginForm={false}
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
    button?.props.onClick?.(testEvent);

    expect(onToggleEmailLoginForm).toHaveBeenCalledTimes(1);
    expect(onSendEmailLink).not.toHaveBeenCalled();
  });

  it("renders the email form and complete action during an email-link flow", () => {
    const html = renderToStaticMarkup(
      <WebSignIn
        {...baseProps}
        showEmailLoginForm={true}
        isEmailLinkFlow={true}
        isValidAuthEmail={true}
        authEmail="user@example.com"
      />
    );

    expect(html).toContain('id="landingEmailInput"');
    expect(html).toContain("Send Link");
    expect(html).toContain("Complete Sign-In");
  });

  it("renders invalid email-link guidance alongside the new-link controls", () => {
    const html = renderToStaticMarkup(
      <WebSignIn
        {...baseProps}
        showEmailLoginForm={true}
        isEmailLinkFlow={true}
        isValidAuthEmail={true}
        authEmail="user@example.com"
        authError={USED_OR_EXPIRED_EMAIL_LINK_MESSAGE}
      />
    );

    expect(html).toContain(USED_OR_EXPIRED_EMAIL_LINK_MESSAGE);
    expect(html).toContain("webSignInAuthTransitionStack isEmailMode");
    expect(html).toContain("Send Link");
  });
});
