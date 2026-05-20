"use client";

import { useSearchParams } from "next/navigation";
import SharedWebSignInClient from "../auth/SharedWebSignInClient";

export default function LoginPageClient() {
  const searchParams = useSearchParams();
  const shouldStartProCheckout = searchParams.get("checkout") === "pro";

  return <SharedWebSignInClient shouldStartProCheckout={shouldStartProCheckout} />;
}
