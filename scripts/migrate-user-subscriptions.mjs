import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const LEGACY_STRIPE_FIELDS = [
  "stripeCustomerId",
  "stripeSubscriptionId",
  "stripePriceId",
  "stripeSubscriptionStatus",
  "stripeSyncedAt",
];

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
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

function hasLegacyStripeFields(data) {
  return LEGACY_STRIPE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(data, field));
}

function buildSubscriptionPayload(userData, existingCreatedAt) {
  const payload = {
    schemaVersion: 1,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existingCreatedAt || FieldValue.serverTimestamp(),
  };
  for (const field of LEGACY_STRIPE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(userData, field)) {
      payload[field] = userData[field];
    }
  }
  return payload;
}

function buildLegacyCleanupPayload() {
  return Object.fromEntries(LEGACY_STRIPE_FIELDS.map((field) => [field, FieldValue.delete()]));
}

async function main() {
  const write = hasArg("--write");
  const cleanupLegacyFields = hasArg("--cleanup-legacy-fields");
  const db = initDb();
  const totals = {
    scanned: 0,
    withLegacyFields: 0,
    migrated: 0,
    cleaned: 0,
    skipped: 0,
    missingCustomerId: 0,
    errors: 0,
  };

  console.log(
    [
      "[migrate-user-subscriptions]",
      write ? "WRITE mode" : "DRY-RUN mode",
      cleanupLegacyFields ? "cleanup legacy fields" : "backfill only",
    ].join(" | ")
  );

  const usersSnap = await db.collection("users").get();
  for (const userDoc of usersSnap.docs) {
    totals.scanned += 1;
    const userData = userDoc.data() || {};
    if (!hasLegacyStripeFields(userData)) {
      totals.skipped += 1;
      continue;
    }

    totals.withLegacyFields += 1;
    if (!asString(userData.stripeCustomerId)) {
      totals.missingCustomerId += 1;
    }

    try {
      const subscriptionRef = db.collection("userSubscriptions").doc(userDoc.id);
      const subscriptionSnap = await subscriptionRef.get();
      const subscriptionPayload = buildSubscriptionPayload(
        userData,
        subscriptionSnap.exists ? subscriptionSnap.get("createdAt") : null
      );

      if (write && !cleanupLegacyFields) {
        await subscriptionRef.set(subscriptionPayload, { merge: true });
      }
      totals.migrated += 1;

      if (cleanupLegacyFields) {
        if (write) {
          await userDoc.ref.set(buildLegacyCleanupPayload(), { merge: true });
        }
        totals.cleaned += 1;
      }
    } catch (error) {
      totals.errors += 1;
      console.error("[migrate-user-subscriptions] user failed", {
        uid: userDoc.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log("[migrate-user-subscriptions] complete", totals);
  if (!write) {
    console.log("No writes were made. Re-run with --write to mutate Firestore.");
  }
  if (cleanupLegacyFields && !write) {
    console.log("Legacy fields were not deleted because this was a dry run.");
  }
  if (totals.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[migrate-user-subscriptions] failed", error);
  process.exitCode = 1;
});
