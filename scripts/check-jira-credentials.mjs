import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const contents = readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || key in process.env) continue;
    process.env[key] = unquoteEnvValue(trimmed.slice(separatorIndex + 1));
  }
}

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getJiraErrorMessage(payload) {
  const messages = Array.isArray(payload?.errorMessages) ? payload.errorMessages.filter(Boolean) : [];
  const fieldErrors = payload?.errors && typeof payload.errors === "object" ? Object.values(payload.errors).filter(Boolean) : [];
  return String(messages[0] || fieldErrors[0] || payload?.message || "").trim();
}

async function jiraFetch(url, options = {}) {
  const jiraEmail = getRequiredEnv("JIRA_EMAIL");
  const jiraApiToken = getRequiredEnv("JIRA_API_TOKEN");
  const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString("base64");
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Accept-Language": "en-US",
      ...options.headers,
    },
    cache: "no-store",
  });
}

async function assertOk(label, response) {
  const payload = await readJson(response);
  if (response.ok) return payload;
  const message = getJiraErrorMessage(payload);
  throw new Error(`${label} failed with HTTP ${response.status}${message ? `: ${message}` : "."}`);
}

async function main() {
  loadEnvFile(path.resolve(".env.local"));

  const jiraBaseUrl = getRequiredEnv("JIRA_BASE_URL").replace(/\/+$/, "");
  const jiraProjectKey = getRequiredEnv("JIRA_PROJECT_KEY");

  console.log(`[jira] Checking credentials for ${jiraBaseUrl} project ${jiraProjectKey}.`);
  console.log("[jira] Secret values are intentionally not printed.");

  const myself = await assertOk("Jira /myself", await jiraFetch(`${jiraBaseUrl}/rest/api/3/myself`));
  console.log(`[jira] Auth OK for account ${myself?.accountType || "unknown"}.`);

  await assertOk(
    `Jira project ${jiraProjectKey}`,
    await jiraFetch(`${jiraBaseUrl}/rest/api/3/project/${encodeURIComponent(jiraProjectKey)}`)
  );
  console.log(`[jira] Project ${jiraProjectKey} is visible to the configured account.`);

  const metadata = await assertOk(
    "Jira create metadata",
    await jiraFetch(`${jiraBaseUrl}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(jiraProjectKey)}&expand=projects.issuetypes`)
  );
  const issueTypes = Array.isArray(metadata?.projects?.[0]?.issuetypes)
    ? metadata.projects[0].issuetypes.map((issueType) => issueType?.name).filter(Boolean)
    : [];
  console.log(`[jira] Issue types visible for ${jiraProjectKey}: ${issueTypes.join(", ") || "none"}.`);
}

main().catch((error) => {
  console.error(`[jira] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
