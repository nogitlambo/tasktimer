"use client";

const CUSTOM_AVATAR_CANVAS_SIZE = 512;
const CUSTOM_AVATAR_WEBP_QUALITY = 0.88;

type DecodedAvatarImage = CanvasImageSource & {
  width: number;
  height: number;
  close?: () => void;
};

function loadAvatarImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not process selected image."));
    };
    image.src = objectUrl;
  });
}

async function decodeAvatarImage(file: File): Promise<DecodedAvatarImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return bitmap as DecodedAvatarImage;
    } catch {
      // Fall through to the image element decoder for browsers/files that fail createImageBitmap.
    }
  }
  return loadAvatarImageElement(file);
}

export async function resizeCustomAvatarFile(file: File): Promise<string> {
  const image = await decodeAvatarImage(file);
  try {
    const sourceWidth = Math.floor(Number(image.width || 0));
    const sourceHeight = Math.floor(Number(image.height || 0));
    if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error("Could not process selected image.");

    const canvas = document.createElement("canvas");
    canvas.width = CUSTOM_AVATAR_CANVAS_SIZE;
    canvas.height = CUSTOM_AVATAR_CANVAS_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process selected image.");

    const sourceSize = Math.min(sourceWidth, sourceHeight);
    const sourceX = Math.floor((sourceWidth - sourceSize) / 2);
    const sourceY = Math.floor((sourceHeight - sourceSize) / 2);
    context.clearRect(0, 0, CUSTOM_AVATAR_CANVAS_SIZE, CUSTOM_AVATAR_CANVAS_SIZE);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      CUSTOM_AVATAR_CANVAS_SIZE,
      CUSTOM_AVATAR_CANVAS_SIZE,
    );

    const webpDataUrl = canvas.toDataURL("image/webp", CUSTOM_AVATAR_WEBP_QUALITY);
    if (webpDataUrl.startsWith("data:image/webp")) return webpDataUrl;
    const pngDataUrl = canvas.toDataURL("image/png");
    if (pngDataUrl.startsWith("data:image/png")) return pngDataUrl;
    throw new Error("Could not process selected image.");
  } finally {
    image.close?.();
  }
}
