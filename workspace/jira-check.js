const fs = require("fs");
const https = require("https");

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      return idx >= 0 ? [line.slice(0, idx), line.slice(idx + 1)] : [line, ""];
    })
);

const auth = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");
const url = new URL(`${String(env.JIRA_BASE_URL || "").replace(/\/+$/, "")}/rest/api/3/issue/TLAPP-24?fields=status`);

https
  .get(
    url,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    },
    (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        let parsed = body;
        try {
          parsed = body ? JSON.parse(body) : null;
        } catch {}
        console.log(JSON.stringify({ statusCode: res.statusCode, body: parsed }, null, 2));
      });
    }
  )
  .on("error", (error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
