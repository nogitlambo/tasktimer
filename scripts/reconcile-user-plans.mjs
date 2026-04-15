import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

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

function normalizePlan(value) {
  return asString(value).toLowerCase() === "pro" ? "pro" : "free";
}

function planFromStripeStatus(status) {
  return ACTIVE_STATUSES.has(asString(status).toLowerCase()) ? "pro" : "free";
}

async function main() {
  const write = hasArg("--write");
  const db = initDb();
  const totals = {
    scanned: 0,
    matched: 0,
    corrected: 0,
    freeByDefault: 0,
    errors: 0,
  };

  console.log(["[reconcile-user-plans]", write ? "WRITE mode" : "DRY-RUN mode"].join(" | "));

  const [subscriptionSnap, userSnap] = await Promise.all([
    db.collection("userSubscriptions").get(),
    db.collection("users").get(),
  ]);

  const expectedPlanByUid = new Map();
  subscriptionSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    expectedPlanByUid.set(docSnap.id, planFromStripeStatus(data.stripeSubscriptionStatus));
  });

  for (const userDoc of userSnap.docs) {
    totals.scanned += 1;
    const currentPlan = normalizePlan(userDoc.get("plan"));
    const expectedPlan = expectedPlanByUid.get(userDoc.id) || "free";
    if (!expectedPlanByUid.has(userDoc.id)) {
      totals.freeByDefault += 1;
    }

    if (currentPlan === expectedPlan) {
      totals.matched += 1;
      continue;
    }

    try {
      if (write) {
        await userDoc.ref.set(
          {
            schemaVersion: 1,
            plan: expectedPlan,
            planUpdatedAt: FieldValue.serverTimestamp(),
            createdAt: userDoc.get("createdAt") || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      totals.corrected += 1;
      console.log("[reconcile-user-plans] drift detected", {
        uid: userDoc.id,
        currentPlan,
        expectedPlan,
        source: expectedPlanByUid.has(userDoc.id) ? "userSubscriptions" : "default-free",
      });
    } catch (error) {
      totals.errors += 1;
      console.error("[reconcile-user-plans] user failed", {
        uid: userDoc.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log("[reconcile-user-plans] complete", totals);
  if (!write) {
    console.log("No writes were made. Re-run with --write to repair plan drift.");
  }
  if (totals.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[reconcile-user-plans] failed", error);
  process.exitCode = 1;
});
