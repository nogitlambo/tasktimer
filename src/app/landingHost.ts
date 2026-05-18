export const LIVE_LANDING_HOST = "tasklaunch.app";
export const LOCALHOST_LANDING_HOST = "localhost:3000";

function normalizeHost(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function shouldUseLandingSoon(host: string | null | undefined) {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;
  if (normalizedHost === LOCALHOST_LANDING_HOST) return false;
  return normalizedHost === LIVE_LANDING_HOST;
}
