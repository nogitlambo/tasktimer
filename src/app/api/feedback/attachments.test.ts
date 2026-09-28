import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({save: vi.fn(), remove: vi.fn(), file: vi.fn()}));
vi.mock("@/lib/firebaseAdmin", () => ({getFirebaseAdminStorageBucket: () => ({file: mocks.file})}));
import { storeFeedbackAttachments } from "./attachments";
describe("private feedback screenshot storage", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.save.mockReset(); mocks.remove.mockResolvedValue(undefined);
    mocks.file.mockReturnValue({save: mocks.save, delete: mocks.remove});
  });
  it("uploads exact bytes to a unique private attempt prefix without download tokens", async () => {
    const data = new Uint8Array([137, 80, 78, 71]);
    const files = await storeFeedbackAttachments("feedback-1", [{filename: "screenshot.png", mimeType: "image/png", data}], ["hash"]);
    expect(files[0]).toMatchObject({filename: "screenshot.png", size: 4, sha256: "hash"});
    expect(files[0].path).toMatch(/^feedback-email\/feedback-1\/[a-f0-9-]+\/0.png$/);
    expect(mocks.save).toHaveBeenCalledWith(Buffer.from(data), {resumable: false, contentType: "image/png", metadata: {cacheControl: "private, no-store"}});
  });
  it("cleans all uploaded and uncertain objects after a partial upload failure", async () => {
    mocks.save.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("upload interrupted"));
    const file = {filename: "screen.png", mimeType: "image/png", data: new Uint8Array([1])};
    await expect(storeFeedbackAttachments("feedback-1", [file, file], ["a", "b"])).rejects.toThrow();
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
});
