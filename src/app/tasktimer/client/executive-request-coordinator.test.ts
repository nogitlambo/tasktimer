import { describe, expect, it, vi } from "vitest";

import { createExecutiveRequestCoordinator } from "./executive-request-coordinator";

describe("Executive request coordinator", () => {
  it("shares an in-flight automatic request and returns readable responses to every consumer", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const coordinator = createExecutiveRequestCoordinator(fetchImpl as unknown as typeof fetch);

    const first = coordinator.request({ input: "/api/recommendations/next-best-action", init: { method: "POST", body: '{"timezone":"UTC"}' } });
    const second = coordinator.request({ input: "/api/recommendations/next-best-action", init: { method: "POST", body: '{"timezone":"UTC"}' } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveFetch?.(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect((await first).json()).resolves.toEqual({ ok: true });
    await expect((await second).json()).resolves.toEqual({ ok: true });
  });

  it("gates only automatic calls to a rate-limited endpoint for one minute", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "limited" }), { status: 429 }));
    const coordinator = createExecutiveRequestCoordinator(fetchImpl as unknown as typeof fetch);

    expect((await coordinator.request({ input: "/api/executive-function/recovery", init: { method: "POST" } })).status).toBe(429);
    expect((await coordinator.request({ input: "/api/executive-function/recovery", init: { method: "POST" } })).status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await coordinator.request({ input: "/api/executive-function/recovery", init: { method: "POST" }, mode: "user" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
