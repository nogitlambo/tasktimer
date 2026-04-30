import { beforeEach, describe, expect, it, vi } from "vitest";

const assertArchieEnabled = vi.fn();
const verifyArchieRequestUser = vi.fn();
const recordArchieTelemetryEvent = vi.fn();
const enforceUidRateLimit = vi.fn();

vi.mock("../shared", () => ({
  assertArchieEnabled,
  verifyArchieRequestUser,
  recordArchieTelemetryEvent,
  createArchieErrorResponse: (error: unknown) => {
    const typedError = error as Error & { code?: string; status?: number };
    return Response.json({ error: typedError.message || String(error), code: typedError.code || "archie/internal" }, { status: typedError.status || 500 });
  },
}));

vi.mock("../../shared/rateLimit", () => ({
  enforceUidRateLimit,
}));

function createRequest() {
  return new Request("http://localhost/api/archie/events", {
    method: "POST",
    body: JSON.stringify({
      sessionId: "session-1",
      eventType: "response_upvote",
    }),
  });
}

describe("POST /api/archie/events", () => {
  beforeEach(() => {
    assertArchieEnabled.mockReset();
    verifyArchieRequestUser.mockReset().mockResolvedValue({ uid: "user-1" });
    recordArchieTelemetryEvent.mockReset().mockResolvedValue({ ok: true });
    enforceUidRateLimit.mockReset().mockResolvedValue(undefined);
  });

  it("returns a disabled response before auth and rate limiting when Archie is off", async () => {
    const error = new Error("Archie is currently disabled.") as Error & { code: string; status: number };
    error.code = "archie/disabled";
    error.status = 503;
    assertArchieEnabled.mockImplementation(() => {
      throw error;
    });

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.code).toBe("archie/disabled");
    expect(verifyArchieRequestUser).not.toHaveBeenCalled();
    expect(enforceUidRateLimit).not.toHaveBeenCalled();
    expect(recordArchieTelemetryEvent).not.toHaveBeenCalled();
  });
});
