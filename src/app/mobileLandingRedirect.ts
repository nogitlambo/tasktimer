export function shouldRedirectMobileLanding(userAgent: string | null | undefined) {
  const ua = String(userAgent || "").trim();
  if (!ua) return false;
  return /\b(Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini)\b/i.test(ua);
}
