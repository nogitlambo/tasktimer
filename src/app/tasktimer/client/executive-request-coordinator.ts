const AUTOMATIC_CACHE_MS = 750;
const RATE_LIMIT_COOLDOWN_MS = 60_000;

type RequestMode = "automatic" | "user";

type CoordinatedRequest = {
  input: RequestInfo | URL;
  init?: RequestInit;
  mode?: RequestMode;
};

function requestBody(init?: RequestInit) {
  return typeof init?.body === "string" ? init.body : "";
}

function requestKey(input: RequestInfo | URL, init?: RequestInit) {
  return `${String(init?.method || "GET").toUpperCase()} ${String(input)} ${requestBody(init)}`;
}

function endpointKey(input: RequestInfo | URL) {
  try {
    return new URL(String(input), typeof window === "undefined" ? "http://localhost" : window.location.origin).pathname;
  } catch {
    return String(input).split("?")[0];
  }
}

/**
 * Shares Executive read requests across Dashboard and Executive renderers.
 * Returned responses are clones so each existing parser retains ownership of
 * its response body.
 */
export function createExecutiveRequestCoordinator(fetchImpl: typeof fetch) {
  const inFlight = new Map<string, Promise<Response>>();
  const recentAutomatic = new Map<string, { expiresAt: number; response: Response }>();
  const rateLimitedUntil = new Map<string, number>();

  async function request({ input, init, mode = "automatic" }: CoordinatedRequest) {
    const key = requestKey(input, init);
    const endpoint = endpointKey(input);
    const now = Date.now();
    const blockedUntil = rateLimitedUntil.get(endpoint) || 0;
    if (mode === "automatic" && blockedUntil > now) {
      return new Response(JSON.stringify({ error: "This Executive section is temporarily rate limited. Please try again shortly." }), { status: 429, headers: { "Content-Type": "application/json" } });
    }

    if (mode === "automatic") {
      const cached = recentAutomatic.get(key);
      if (cached && cached.expiresAt > now) return cached.response.clone();
    }

    let pending = inFlight.get(key);
    if (!pending) {
      // A caller's AbortSignal belongs to its renderer, not this shared request.
      const { signal: _signal, ...sharedInit } = init || {};
      pending = fetchImpl(input, sharedInit).then((response) => {
        if (response.status === 429) rateLimitedUntil.set(endpoint, Date.now() + RATE_LIMIT_COOLDOWN_MS);
        if (mode === "automatic" && response.ok) {
          recentAutomatic.set(key, { response: response.clone(), expiresAt: Date.now() + AUTOMATIC_CACHE_MS });
        }
        return response;
      }).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    return (await pending).clone();
  }

  return { request };
}

export type ExecutiveRequestCoordinator = ReturnType<typeof createExecutiveRequestCoordinator>;
