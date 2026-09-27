import { describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  },
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  canUseFirebaseAdminDefaultCredentials: () => false,
  getFirebaseAdminAuth: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  hasFirebaseAdminCredentialConfig: () => false,
}));

vi.mock("../jira/feedback/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../jira/feedback/shared")>();
  return {
    ...actual,
    createJiraIssue: vi.fn(),
    syncJiraIssueVote: vi.fn(),
    uploadJiraIssueAttachment: vi.fn(),
  };
});

import { OPTIONS } from "./route";

describe("/api/feedback CORS", () => {
  it("allows native mobile preflight requests with Firebase auth headers", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/feedback", {
        method: "OPTIONS",
        headers: {
          origin: "capacitor://localhost",
          "access-control-request-headers": "content-type,x-firebase-auth",
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Firebase-Auth");
  });

  it("allows mobile webview origins and PATCH preflight requests", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/feedback", {
        method: "OPTIONS",
        headers: {
          origin: "ionic://localhost",
          "access-control-request-method": "PATCH",
          "access-control-request-headers": "content-type,x-firebase-auth",
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("ionic://localhost");
    expect(response.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Firebase-Auth");
  });
});
