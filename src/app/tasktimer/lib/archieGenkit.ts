import { genkit } from "genkit";
import { vertexAI } from "@genkit-ai/google-genai";

function asString(value: unknown) {
  return String(value || "").trim();
}

function getProjectId() {
  return (
    asString(process.env.FIREBASE_ADMIN_PROJECT_ID) ||
    asString(process.env.GOOGLE_CLOUD_PROJECT) ||
    asString(process.env.GCLOUD_PROJECT) ||
    asString(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  );
}

function getServiceAccountCredentials() {
  const clientEmail = asString(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  const privateKey = asString(process.env.FIREBASE_ADMIN_PRIVATE_KEY).replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return undefined;
  return {
    client_email: clientEmail,
    private_key: privateKey,
  };
}

const projectId = getProjectId();
const location = asString(process.env.FIREBASE_VERTEX_AI_LOCATION) || "us-central1";
const credentials = getServiceAccountCredentials();

export const archieGenkit = genkit({
  plugins: [
    vertexAI({
      projectId: projectId || undefined,
      location,
      googleAuth: credentials
        ? {
            credentials,
            projectId: projectId || undefined,
          }
        : undefined,
    }),
  ],
  model: vertexAI.model(asString(process.env.ARCHIE_GEMINI_MODEL) || "gemini-2.5-flash"),
});
