import { getFirebaseAdminStorageBucket } from "@/lib/firebaseAdmin";

import type { BrainDumpVoiceSourceStorage } from "./brainDumpProcessing";

function createdAtMs(value: unknown) {
  const parsed = Date.parse(typeof value === "string" ? value : "");
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function createFirebaseBrainDumpVoiceSourceStorage(): BrainDumpVoiceSourceStorage {
  const bucket = getFirebaseAdminStorageBucket();

  return {
    async getObject(path) {
      const file = bucket.file(path);
      try {
        const [metadata] = await file.getMetadata();
        const [bytes] = await file.download();
        return {
          bytes: new Uint8Array(bytes),
          contentType: String(metadata.contentType || ""),
          sizeBytes: Math.max(0, Math.floor(Number(metadata.size) || 0)),
          createdAtMs: createdAtMs(metadata.timeCreated),
        };
      } catch (error) {
        const code = Number((error as { code?: unknown })?.code);
        if (code === 404) return null;
        throw error;
      }
    },
    async deleteObject(path) {
      await bucket.file(path).delete({ ignoreNotFound: true });
    },
  };
}
