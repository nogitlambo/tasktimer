import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value) {
  return value === true;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function getProjectId() {
  return (
    asString(process.env.FIREBASE_ADMIN_PROJECT_ID) ||
    asString(process.env.GOOGLE_CLOUD_PROJECT) ||
    asString(process.env.GCLOUD_PROJECT) ||
    asString(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  );
}

function getCredential(projectId) {
  const clientEmail = asString(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  const privateKey = asString(process.env.FIREBASE_ADMIN_PRIVATE_KEY).replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return undefined;
  return cert({ projectId, clientEmail, privateKey });
}

function initDb() {
  const projectId = getProjectId();
  const credential = getCredential(projectId);
  const app = getApps().length
    ? getApp()
    : credential && projectId
      ? initializeApp({ credential, projectId })
      : projectId
        ? initializeApp({ projectId })
        : initializeApp();
  const databaseId =
    asString(process.env.FIREBASE_DATABASE_ID) ||
    asString(process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID) ||
    "timebase";
  return getFirestore(app, databaseId);
}

function millisFromTimestampLike(value) {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "object" && typeof value.toMillis === "function") {
    try {
      return Number(value.toMillis()) || 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function parseDevicePath(path) {
  const parts = String(path || "").split("/");
  return {
    uid: parts[1] || "",
    deviceId: parts[3] || "",
  };
}

function isLikelyWebDevice(data) {
  return (
    asString(data.platform).toLowerCase() === "web" ||
    data.native === false ||
    asString(data.kind).toLowerCase() === "webpush" ||
    asString(data.scope).toLowerCase() === "web"
  );
}

function buildRepairPatch(data) {
  const patch = {
    provider: "fcm",
    platform: "web",
    native: false,
    kind: "webpush",
    scope: "web",
    channelId: null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (typeof data.enabled !== "boolean" && asString(data.token)) {
    patch.enabled = true;
  }
  if (!data.createdAt) {
    patch.createdAt = FieldValue.serverTimestamp();
  }
  return patch;
}

async function main() {
  const write = hasArg("--write");
  const clearDuplicates = hasArg("--clear-duplicates");
  const db = initDb();
  const totals = {
    scanned: 0,
    likelyWebDocs: 0,
    missingToken: 0,
    wrongProvider: 0,
    wrongPlatform: 0,
    wrongNative: 0,
    wrongKind: 0,
    wrongScope: 0,
    disabledWithToken: 0,
    duplicateTokens: 0,
    repairedDocs: 0,
    clearedDuplicateDocs: 0,
    errors: 0,
  };

  console.log(
    `[audit-web-push-devices] ${write ? "WRITE" : "DRY-RUN"} mode | duplicates=${clearDuplicates ? "clear" : "report"}`
  );

  const snapshot = await db.collectionGroup("devices").get();
  const tokenOwners = new Map();
  const repairCandidates = [];

  for (const docSnap of snapshot.docs) {
    totals.scanned += 1;
    const data = docSnap.data() || {};
    if (!isLikelyWebDevice(data)) continue;

    totals.likelyWebDocs += 1;
    const token = asString(data.token);
    const provider = asString(data.provider).toLowerCase();
    const platform = asString(data.platform).toLowerCase();
    const kind = asString(data.kind).toLowerCase();
    const scope = asString(data.scope).toLowerCase();
    const enabled = data.enabled !== false;
    const updatedAtMs = Math.max(millisFromTimestampLike(data.updatedAt), millisFromTimestampLike(data.createdAt));
    const pathInfo = parseDevicePath(docSnap.ref.path);

    let needsRepair = false;
    if (!token) totals.missingToken += 1;
    if (provider !== "fcm") {
      totals.wrongProvider += 1;
      needsRepair = true;
    }
    if (platform !== "web") {
      totals.wrongPlatform += 1;
      needsRepair = true;
    }
    if (data.native !== false) {
      totals.wrongNative += 1;
      needsRepair = true;
    }
    if (kind !== "webpush") {
      totals.wrongKind += 1;
      needsRepair = true;
    }
    if (scope !== "web") {
      totals.wrongScope += 1;
      needsRepair = true;
    }
    if (token && !enabled) {
      totals.disabledWithToken += 1;
    }

    if (needsRepair) {
      repairCandidates.push({ ref: docSnap.ref, data, path: docSnap.ref.path });
    }

    if (token) {
      const entry = {
        ref: docSnap.ref,
        path: docSnap.ref.path,
        uid: pathInfo.uid,
        deviceId: pathInfo.deviceId,
        enabled,
        updatedAtMs,
      };
      const existing = tokenOwners.get(token) || [];
      existing.push(entry);
      tokenOwners.set(token, existing);
    }
  }

  const duplicateRows = [];
  for (const [token, rows] of tokenOwners.entries()) {
    if (rows.length < 2) continue;
    totals.duplicateTokens += 1;
    rows.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return b.updatedAtMs - a.updatedAtMs;
    });
    duplicateRows.push({ token, keep: rows[0], drop: rows.slice(1) });
  }

  if (write) {
    for (const candidate of repairCandidates) {
      try {
        await candidate.ref.set(buildRepairPatch(candidate.data), { merge: true });
        totals.repairedDocs += 1;
      } catch (error) {
        totals.errors += 1;
        console.error("[audit-web-push-devices] repair failed", {
          path: candidate.path,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (clearDuplicates) {
      for (const duplicate of duplicateRows) {
        for (const row of duplicate.drop) {
          try {
            await row.ref.set(
              {
                enabled: false,
                appActive: false,
                appStateUpdatedAtMs: Date.now(),
                token: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
            totals.clearedDuplicateDocs += 1;
          } catch (error) {
            totals.errors += 1;
            console.error("[audit-web-push-devices] duplicate cleanup failed", {
              path: row.path,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }
  }

  console.log("[audit-web-push-devices] summary", totals);
  if (duplicateRows.length) {
    console.log(
      "[audit-web-push-devices] duplicate samples",
      duplicateRows.slice(0, 10).map((entry) => ({
        keep: entry.keep.path,
        drop: entry.drop.map((row) => row.path),
      }))
    );
  }
  if (!write) {
    console.log("No writes were made. Re-run with --write to repair web device docs.");
    console.log("Add --clear-duplicates to clear stale duplicate token docs during the write pass.");
  }
  if (totals.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[audit-web-push-devices] failed", error);
  process.exitCode = 1;
});
