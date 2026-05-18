import { shouldUseLandingSoon } from "./landingHost";
import { shouldRedirectMobileLanding } from "./mobileLandingRedirect";

export type HomeEntryResolution =
  | { action: "redirect"; href: "/login" }
  | { action: "render"; variant: "landing" | "landingsoon" };

export function resolveHomeEntry(args: {
  host: string | null | undefined;
  userAgent: string | null | undefined;
  isNativeRuntime: boolean;
}): HomeEntryResolution {
  if (args.isNativeRuntime) {
    return { action: "redirect", href: "/login" };
  }
  if (shouldRedirectMobileLanding(args.userAgent)) {
    return { action: "render", variant: "landingsoon" };
  }
  return {
    action: "render",
    variant: shouldUseLandingSoon(args.host) ? "landingsoon" : "landing",
  };
}
