"use client";

import { getApiUrl } from "@/app/tasktimer/lib/apiClient";

export async function sendSignInLinkEmail(email: string) {
  const response = await fetch(getApiUrl("/api/auth/email-link/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Could not send sign-in link.");
  }
}
