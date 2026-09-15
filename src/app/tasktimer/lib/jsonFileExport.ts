"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

type JsonFileOptions = { filename: string; text: string };
type SaveResult = { cancelled: boolean };

const NativeFileExport = registerPlugin<{
  saveJson: (options: JsonFileOptions) => Promise<SaveResult>;
}>("TaskLaunchFileExport");

export async function saveJsonFile(filename: string, text: string): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    const result = await NativeFileExport.saveJson({ filename, text });
    return !result.cancelled;
  }

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 0);
  return true;
}
