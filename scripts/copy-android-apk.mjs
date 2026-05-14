import { readFile } from "node:fs/promises";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { google } from "googleapis";

const root = process.cwd();
const sourceApkPath = path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const secretsDirPath = path.join(root, "workspace", "secrets");
const defaultServiceAccountPath = path.join(secretsDirPath, "tasktimer-prod-7ce230e31df3.json");
const defaultDriveFolderId = "1WiAeikmzft6HgRCvpPIL-9q57chgCwbj";
const uploadedFilename = "app-debug.apk";

function resolveServiceAccountPath() {
  const configuredPath = (process.env.GOOGLE_SERVICE_ACCOUNT_PATH || "").trim();
  if (configuredPath) return configuredPath;
  if (existsSync(defaultServiceAccountPath)) return defaultServiceAccountPath;
  if (!existsSync(secretsDirPath)) return defaultServiceAccountPath;

  const matchingFiles = readdirSync(secretsDirPath)
    .filter((entry) => /^tasktimer-prod-.*\.json$/i.test(entry))
    .sort();

  if (matchingFiles.length === 1) return path.join(secretsDirPath, matchingFiles[0]);
  return defaultServiceAccountPath;
}

async function loadServiceAccountCredentials() {
  const rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (rawJson) return JSON.parse(rawJson);

  const credentialsPath = resolveServiceAccountPath();
  if (!existsSync(credentialsPath)) {
    throw new Error(
      `Google service account credentials were not found at ${credentialsPath}. ` +
        "Move the local JSON key to workspace/secrets/, ensure there is exactly one tasktimer-prod-*.json key there, set GOOGLE_SERVICE_ACCOUNT_PATH, or set GOOGLE_SERVICE_ACCOUNT_JSON."
    );
  }

  const fileContents = await readFile(credentialsPath, "utf8");
  return JSON.parse(fileContents);
}

async function uploadToDriveFolder() {
  const folderId = (process.env.ANDROID_APK_DRIVE_FOLDER_ID || defaultDriveFolderId).trim();
  if (!folderId) {
    throw new Error("No Google Drive folder ID is configured. Set ANDROID_APK_DRIVE_FOLDER_ID.");
  }

  const credentials = await loadServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const drive = google.drive({ version: "v3", auth });

  try {
    const existingFiles = await drive.files.list({
      q: `'${folderId}' in parents and name='${uploadedFilename}' and trashed=false`,
      fields: "files(id, name, webViewLink)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 10,
    });

    const media = {
      mimeType: "application/vnd.android.package-archive",
      body: createReadStream(sourceApkPath),
    };

    const existingFileId = existingFiles.data.files?.[0]?.id;
    if (existingFileId) {
      const updated = await drive.files.update({
        fileId: existingFileId,
        media,
        fields: "id, name, webViewLink",
        supportsAllDrives: true,
      });
      console.log(`Uploaded APK to Google Drive by updating ${updated.data.name || uploadedFilename}`);
      if (updated.data.webViewLink) console.log(updated.data.webViewLink);
      return;
    }

    const created = await drive.files.create({
      requestBody: {
        name: uploadedFilename,
        parents: [folderId],
      },
      media,
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });
    console.log(`Uploaded APK to Google Drive as ${created.data.name || uploadedFilename}`);
    if (created.data.webViewLink) console.log(created.data.webViewLink);
  } catch (error) {
    const message = String(error?.message || error);
    const serviceAccountEmail = credentials.client_email || "the configured service account";
    if (message.includes("drive.googleapis.com") && message.includes("disabled")) {
      throw new Error(
        "Google Drive API is disabled for project tasktimer-prod (project number 996538028829).\n" +
          "Enable it here, wait a few minutes, then rerun `npm run android:apk`:\n" +
          "https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=996538028829"
      );
    }
    if (message.includes("insufficientParentPermissions")) {
      throw new Error(
        `Google Drive rejected upload to folder ${folderId} because ${serviceAccountEmail} does not have permission to add files there.\n` +
          `Share https://drive.google.com/drive/folders/${folderId} with ${serviceAccountEmail} as Editor.\n` +
          "If the folder is inside a shared drive, grant Content manager (or stronger) on that shared drive or target folder, then rerun `npm run android:apk`."
      );
    }
    throw error;
  }
}

async function main() {
  if (!existsSync(sourceApkPath)) {
    throw new Error(`APK not found at ${sourceApkPath}. Run the Android debug build before copying.`);
  }

  await uploadToDriveFolder();
}

await main();
