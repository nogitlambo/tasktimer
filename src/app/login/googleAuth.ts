import { GoogleAuthProvider } from "firebase/auth";

export function createGoogleSignInProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export function createNativeGoogleSignInOptions() {
  return {
    skipNativeAuth: true,
    useCredentialManager: false,
  };
}
