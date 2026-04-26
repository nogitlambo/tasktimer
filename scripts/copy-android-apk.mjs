import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { google } from "googleapis";

const root = process.cwd();
const sourceApkPath = path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const defaultServiceAccountPath = path.join(root, "tasktimer-prod-7ce230e31df3.json");
const defaultDriveFolderId = "1WiAeikmzft6HgRCvpPIL-9q57chgCwbj";
const uploadedFilename = "app-debug.apk";

const userProfile = process.env.USERPROFILE || "";
const driveBaseCandidates = [
  process.env.ANDROID_APK_COPY_BASE_DIR || "",
  process.env.GOOGLE_DRIVE_BASE_DIR || "",
  "G:\\My Drive",
  "G:\\Google Drive",
  userProfile ? path.join(userProfile, "My Drive") : "",
  userProfile ? path.join(userProfile, "Google Drive") : "",
  userProfile ? path.join(userProfile, "Documents", "My Drive") : "",
  userProfile ? path.join(userProfile, "Documents", "Google Drive") : "",
].filter(Boolean);

function unique(values) {
  return [...new Set(values)];
}

function resolveCandidateDestDirs() {
  const explicitDestDir = (process.env.ANDROID_APK_COPY_DIR || "").trim();
  if (explicitDestDir) return [explicitDestDir];
  return unique(driveBaseCandidates).map((baseDir) => path.join(baseDir, "Apps"));
}

async function copyToLocalDir(destDir) {
  await mkdir(destDir, { recursive: true });
  const destApkPath = path.join(destDir, uploadedFilename);
  await copyFile(sourceApkPath, destApkPath);
  console.log(`Copied APK to ${destApkPath}`);
}

async function loadServiceAccountCredentials() {
  const rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (rawJson) return JSON.parse(rawJson);

  const credentialsPath = (process.env.GOOGLE_SERVICE_ACCOUNT_PATH || defaultServiceAccountPath).trim();
  if (!existsSync(credentialsPath)) {
    throw new Error(
      `Google service account credentials were not found at ${credentialsPath}. ` +
        "Set GOOGLE_SERVICE_ACCOUNT_PATH or GOOGLE_SERVICE_ACCOUNT_JSON."
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
    scopes: ["https://www.googleapis.com/auth/drive.file"],
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
    if (message.includes("drive.googleapis.com") && message.includes("disabled")) {
      throw new Error(
        "Google Drive API is disabled for project tasktimer-prod (project number 996538028829).\n" +
          "Enable it here, wait a few minutes, then rerun `npm run android:apk`:\n" +
          "https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=996538028829"
      );
    }
    throw error;
  }
}

async function main() {
  if (!existsSync(sourceApkPath)) {
    throw new Error(`APK not found at ${sourceApkPath}. Run the Android debug build before copying.`);
  }

  const candidateDestDirs = resolveCandidateDestDirs();
  const resolvedLocalDestDir = candidateDestDirs.find((dirPath) => existsSync(dirPath));
  if (resolvedLocalDestDir) {
    await copyToLocalDir(resolvedLocalDestDir);
    return;
  }

  await uploadToDriveFolder();
}

await main();
