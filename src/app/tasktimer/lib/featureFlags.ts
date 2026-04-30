function normalizeEnvFlag(value: string | undefined, fallback: boolean) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

export function isArchieEnabled() {
  return normalizeEnvFlag(process.env.NEXT_PUBLIC_ENABLE_ARCHIE, true);
}

export function isOnboardingEnabled() {
  return normalizeEnvFlag(process.env.NEXT_PUBLIC_ENABLE_ONBOARDING, true);
}
