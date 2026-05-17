export type InteractionHapticsIntensity = "max" | "medium" | "low";

export function normalizeInteractionHapticsIntensity(value: unknown): InteractionHapticsIntensity {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "low") return "low";
  if (raw === "med" || raw === "medium") return "medium";
  return "max";
}
