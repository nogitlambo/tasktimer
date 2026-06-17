import { describe, expect, it } from "vitest";

import { getEmailLinkSendErrorMessage, resolveEmailLinkContinueUrl } from "./emailLinkAuth";

describe("resolveEmailLinkContinueUrl", () => {
  it("uses the current web origin for normal browser launches", () => {
    expect(
      resolveEmailLinkContinueUrl({
        location: {
          origin: "https://tasklaunch.app",
          protocol: "https:",
          hostname: "tasklaunch.app",
        },
        appUrl: "https://tasktimer-prod.firebaseapp.com",
      })
    ).toBe("https://tasklaunch.app/login/");
  });

  it("prefers a non-local configured app URL when localhost is only the dev origin", () => {
    expect(
      resolveEmailLinkContinueUrl({
        location: {
          origin: "http://localhost:3000",
          protocol: "http:",
          hostname: "localhost",
        },
        appUrl: "https://tasktimer-prod.firebaseapp.com",
      })
    ).toBe("https://tasktimer-prod.firebaseapp.com/login/");
  });

  it("uses the current localhost origin for localhost app URLs", () => {
    expect(
      resolveEmailLinkContinueUrl({
        location: {
          origin: "http://localhost:3000",
          protocol: "http:",
          hostname: "localhost",
        },
        appUrl: "http://localhost:3000",
        authDomain: "tasktimer-prod.firebaseapp.com",
      })
    ).toBe("http://localhost:3000/login/");
  });

  it("uses the configured app URL for native and file launches", () => {
    expect(
      resolveEmailLinkContinueUrl({
        location: {
          origin: "capacitor://localhost",
          protocol: "capacitor:",
          hostname: "localhost",
        },
        appUrl: "https://tasktimer-prod.firebaseapp.com",
      })
    ).toBe("https://tasktimer-prod.firebaseapp.com/login/");
  });

  it("uses the canonical app URL for Android WebView https localhost callbacks", () => {
    expect(
      resolveEmailLinkContinueUrl({
        location: {
          origin: "https://localhost",
          protocol: "https:",
          hostname: "localhost",
        },
        appUrl: "",
        authDomain: "tasktimer-prod.firebaseapp.com",
      })
    ).toBe("https://tasklaunch.app/login/");
  });

  it("falls back to the canonical app URL for Android WebView localhost without configured domains", () => {
    expect(
      resolveEmailLinkContinueUrl({
        location: {
          origin: "https://localhost",
          protocol: "https:",
          hostname: "localhost",
        },
        appUrl: "",
        authDomain: "",
      })
    ).toBe("https://tasklaunch.app/login/");
  });

  it("does not trust a configured https localhost app URL for Android WebView email callbacks", () => {
    expect(
      resolveEmailLinkContinueUrl({
        location: {
          origin: "https://localhost",
          protocol: "https:",
          hostname: "localhost",
        },
        appUrl: "https://localhost/tasklaunch/index.html",
        authDomain: "tasktimer-prod.firebaseapp.com",
      })
    ).toBe("https://tasklaunch.app/login/");
  });

  it("falls back to the canonical app URL instead of the Firebase auth domain", () => {
    expect(
      resolveEmailLinkContinueUrl({
        location: null,
        appUrl: "",
        authDomain: "example-prod.firebaseapp.com",
      })
    ).toBe("https://tasklaunch.app/login/");
  });

  it("does not fall back to the Firebase auth domain when the current origin can handle the callback", () => {
    expect(
      resolveEmailLinkContinueUrl({
        location: {
          origin: "https://tasklaunch.app",
          protocol: "https:",
          hostname: "tasklaunch.app",
        },
        appUrl: "",
        authDomain: "tasktimer-prod.firebaseapp.com",
      })
    ).toBe("https://tasklaunch.app/login/");
  });
});

describe("getEmailLinkSendErrorMessage", () => {
  it("explains unauthorized continue URL failures", () => {
    expect(getEmailLinkSendErrorMessage({ code: "auth/unauthorized-continue-uri" })).toContain(
      "not authorized in Firebase Authentication"
    );
  });

  it("explains disabled provider failures", () => {
    expect(getEmailLinkSendErrorMessage({ code: "auth/operation-not-allowed" })).toContain(
      "Email link sign-in is not enabled"
    );
  });
});
