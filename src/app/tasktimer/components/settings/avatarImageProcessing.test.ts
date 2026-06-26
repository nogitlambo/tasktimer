import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resizeCustomAvatarFile } from "./avatarImageProcessing";

type DrawImageCall = Parameters<CanvasRenderingContext2D["drawImage"]>;

function makeImageFile() {
  return new File(["avatar"], "avatar.png", { type: "image/png" });
}

function installCanvasMock({ toDataURL }: { toDataURL: ReturnType<typeof vi.fn> }) {
  const drawImage = vi.fn();
  const clearRect = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ clearRect, drawImage })),
    toDataURL,
  };
  const createElement = vi.fn((tagName: string) => {
    if (tagName !== "canvas") throw new Error(`Unexpected element: ${tagName}`);
    return canvas;
  });
  vi.stubGlobal("document", { createElement });
  return { canvas, clearRect, drawImage };
}

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resizeCustomAvatarFile", () => {
  it("center-crops landscape images to a 512px square canvas", async () => {
    const close = vi.fn();
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 1200, height: 800, close } as ImageBitmap);
    const { canvas, drawImage } = installCanvasMock({ toDataURL: vi.fn(() => "data:image/webp;base64,resized") });

    await expect(resizeCustomAvatarFile(makeImageFile())).resolves.toBe("data:image/webp;base64,resized");

    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage.mock.calls[0].slice(1) as DrawImageCall[number][]).toEqual([200, 0, 800, 800, 0, 0, 512, 512]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("center-crops portrait images to a 512px square canvas", async () => {
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 700, height: 1100 } as ImageBitmap);
    const { drawImage } = installCanvasMock({ toDataURL: vi.fn(() => "data:image/webp;base64,resized") });

    await resizeCustomAvatarFile(makeImageFile());

    expect(drawImage.mock.calls[0].slice(1) as DrawImageCall[number][]).toEqual([0, 200, 700, 700, 0, 0, 512, 512]);
  });

  it("falls back to PNG when WebP export is unavailable", async () => {
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 512, height: 512 } as ImageBitmap);
    const toDataURL = vi.fn((type: string) => (type === "image/webp" ? "data:image/png;base64,browser-fallback" : "data:image/png;base64,resized"));
    installCanvasMock({ toDataURL });

    await expect(resizeCustomAvatarFile(makeImageFile())).resolves.toBe("data:image/png;base64,resized");

    expect(toDataURL).toHaveBeenNthCalledWith(1, "image/webp", 0.88);
    expect(toDataURL).toHaveBeenNthCalledWith(2, "image/png");
  });

  it("rejects when the decoded image has invalid dimensions", async () => {
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 0, height: 512 } as ImageBitmap);
    installCanvasMock({ toDataURL: vi.fn(() => "data:image/webp;base64,resized") });

    await expect(resizeCustomAvatarFile(makeImageFile())).rejects.toThrow("Could not process selected image.");
  });
});
