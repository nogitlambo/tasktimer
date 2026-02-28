"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";

type GuardStatus = "checking" | "authed";

export default function TaskTimerLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<GuardStatus>("checking");

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) {
      router.replace("/");
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setStatus("authed");
        return;
      }
      router.replace("/");
    });
    return () => unsub();
  }, [router]);

  if (status !== "authed") return null;
  return <>{children}</>;
}
