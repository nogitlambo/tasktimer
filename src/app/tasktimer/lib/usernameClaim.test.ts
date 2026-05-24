import { beforeEach, describe, expect, it, vi } from "vitest";

const firebaseClientMocks = vi.hoisted(() => ({
  getFirebaseAuthClient: vi.fn(),
  isNativeOrFileRuntime: vi.fn(),
}));

vi.mock("@/lib/firebaseClient", () => firebaseClientMocks);

import { claimUsernameClient } from "./usernameClaim";

describe("claimUsernameClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseClientMocks.isNativeOrFileRuntime.mockReturnValue(true);
    process.env.NEXT_PUBLIC_APP_URL = "https://tasklaunch.app";
    firebaseClientMocks.getFirebaseAuthClient.mockReturnValue({
      currentUser: {
        uid: "uid-1",
        getIdToken: vi.fn(() => Promise.resolve("id-token")),
      },
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ ok: true, usernameKey: "pilot" }))));
  });

  it("uses the hosted trailing-slash account API URL in native runtime", async () => {
    const result = await claimUsernameClient("pilot");

    expect(result).toEqual({ usernameKey: "pilot" });
    expect(fetch).toHaveBeenCalledWith(
      "https://tasklaunch.app/api/account/claim-username/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-firebase-auth": "id-token" }),
      })
    );
  });
});
