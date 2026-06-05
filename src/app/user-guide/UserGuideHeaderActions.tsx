"use client";

import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import PublicInfoBackButton from "../tasktimer/components/PublicInfoBackButton";
import { getFirebaseAuthClient } from "../../lib/firebaseClient";

function getInitialAuthenticatedState() {
  const auth = getFirebaseAuthClient();
  if (!auth) return false;
  return auth.currentUser ? true : null;
}

export default function UserGuideHeaderActions() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(getInitialAuthenticatedState);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return undefined;
    return onAuthStateChanged(
      auth,
      (user) => setIsAuthenticated(Boolean(user)),
      () => setIsAuthenticated(false)
    );
  }, []);

  if (isAuthenticated === null) return null;

  if (isAuthenticated) return <PublicInfoBackButton />;

  return (
    <>
      <Link href="/" className="landingV2HeaderBack displayFont">
        Home
      </Link>
      <Link href="/login" className="landingV2HeaderBack displayFont">
        Sign In
      </Link>
    </>
  );
}
