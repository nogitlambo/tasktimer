import { describe, expect, it } from "vitest";
import { createGoogleSignInProvider, createNativeGoogleSignInOptions } from "./googleAuth";

describe("Google auth options", () => {
  it("asks Google web auth to show the account chooser", () => {
    const provider = createGoogleSignInProvider() as unknown as {
      customParameters: Record<string, string>;
    };

    expect(provider.customParameters).toMatchObject({ prompt: "select_account" });
  });

  it("disables native Android Credential Manager so Google shows its account chooser", () => {
    const options = createNativeGoogleSignInOptions() as {
      skipNativeAuth: boolean;
      useCredentialManager?: boolean;
    };

    expect(options.skipNativeAuth).toBe(true);
    expect(options.useCredentialManager).toBe(false);
  });
});
