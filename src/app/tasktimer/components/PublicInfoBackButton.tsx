"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getFirebaseAuthClient } from "../../../lib/firebaseClient";
import { resolvePublicInfoRouteBackTarget } from "../lib/routeBack";

function readAuthenticatedState() {
  const auth = getFirebaseAuthClient();
  if (!auth) return Promise.resolve(false);
  if (auth.currentUser) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    let timeoutId = 0;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      window.clearTimeout(timeoutId);
      resolve(value);
    };

    timeoutId = window.setTimeout(() => finish(Boolean(auth.currentUser)), 600);
    unsubscribe = onAuthStateChanged(auth, (user) => finish(Boolean(user)), () => finish(false));
    if (settled) unsubscribe();
  });
}

export default function PublicInfoBackButton() {
  const router = useRouter();

  const handleBack = async () => {
    router.push(resolvePublicInfoRouteBackTarget(await readAuthenticatedState()));
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="landingV2HeaderBack displayFont"
    >
      Back
    </button>
  );
}
