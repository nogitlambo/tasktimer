type PrimitiveGalleryDevGateInput = {
  host?: string | null;
  hostname?: string | null;
  nodeEnv?: string | null;
  flag?: string | null;
};

const DISABLED_VALUES = new Set(["false", "0", "off"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function normalizePrimitiveGalleryHostname(input: Pick<PrimitiveGalleryDevGateInput, "host" | "hostname">) {
  const explicitHostname = String(input.hostname || "").trim().toLowerCase();
  if (explicitHostname) return explicitHostname;

  const host = String(input.host || "").trim().toLowerCase();
  if (!host) return "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end >= 0 ? host.slice(0, end + 1) : host;
  }
  return host.split(":")[0] || host;
}

export function shouldShowPrimitiveGallery(input: PrimitiveGalleryDevGateInput = {}) {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === "production") return false;

  const flag = String(input.flag ?? process.env.NEXT_PUBLIC_SHOW_DESKTOP_RAIL_DEV_ENV ?? "")
    .trim()
    .toLowerCase();
  if (DISABLED_VALUES.has(flag)) return false;

  const hostname = normalizePrimitiveGalleryHostname(input);
  return LOCAL_HOSTNAMES.has(hostname);
}
