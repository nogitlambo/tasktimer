"use client";

import { useSearchParams } from "next/navigation";
import SharedWebSignInClient from "../auth/SharedWebSignInClient";

export default function LoginPageClient() {
  const searchParams = useSearchParams();
  const checkout = searchParams.get("checkout");
  const checkoutOffer = checkout === "plus_yearly" ? "plus_yearly" : checkout === "plus_monthly" || checkout === "pro" ? "plus_monthly" : null;

  return <SharedWebSignInClient checkoutOffer={checkoutOffer} />;
}
