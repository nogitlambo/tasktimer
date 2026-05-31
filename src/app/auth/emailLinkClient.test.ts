import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApiUrl: vi.fn(),
}));

vi.mock("@/app/tasktimer/lib/apiClient", () => ({
  getApiUrl: mocks.getApiUrl,
}));

describe("sendSignInLinkEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.getApiUrl.mockReturnValue("https://tasklaunch.app/api/auth/email-link");
  });

  it("posts through the native-aware API URL resolver", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendSignInLinkEmail } = await import("./emailLinkClient");

    await sendSignInLinkEmail("user@example.com");

    expect(mocks.getApiUrl).toHaveBeenCalledWith("/api/auth/email-link");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://tasklaunch.app/api/auth/email-link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "user@example.com" }),
      })
    );
  });
});
