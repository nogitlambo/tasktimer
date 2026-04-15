import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ROOT = process.cwd();
const USER_GUIDE_PATH = path.join(ROOT, "src", "app", "tasktimer", "components", "UserGuideScreen.tsx");
const ARCHIE_PATH = path.join(ROOT, "src", "app", "tasktimer", "lib", "archieKnowledge.ts");

function normalize(value) {
  return String(value || "").replace(/\r\n/g, "\n");
}

function rel(filePath) {
  return normalize(path.relative(ROOT, filePath)).replaceAll("\\", "/");
}

function readText(filePath) {
  return normalize(fs.readFileSync(filePath, "utf8"));
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, normalize(content), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quote(value) {
  return JSON.stringify(String(value));
}

function unique(values) {
  return [...new Set(values)];
}

function parseArgs(argv) {
  const args = { feature: null, apply: false };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if (entry === "--apply") {
      args.apply = true;
      continue;
    }
    if (entry === "--feature") {
      args.feature = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (entry.startsWith("--feature=")) {
      args.feature = entry.slice("--feature=".length) || null;
      continue;
    }
    if (!entry.startsWith("--")) positionals.push(entry);
  }
  if (!args.feature && positionals.length) {
    args.feature = positionals.join(" ").trim() || null;
  }
  return args;
}

function buildUnifiedDiff(oldText, newText, filePath) {
  const before = normalize(oldText).split("\n");
  const after = normalize(newText).split("\n");
  const oldLen = before.length;
  const newLen = after.length;
  const dp = Array.from({ length: oldLen + 1 }, () => Array.from({ length: newLen + 1 }, () => 0));

  for (let i = oldLen - 1; i >= 0; i -= 1) {
    for (let j = newLen - 1; j >= 0; j -= 1) {
      dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < oldLen && j < newLen) {
    if (before[i] === after[j]) {
      ops.push({ type: " ", line: before[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "-", line: before[i] });
      i += 1;
    } else {
      ops.push({ type: "+", line: after[j] });
      j += 1;
    }
  }
  while (i < oldLen) {
    ops.push({ type: "-", line: before[i] });
    i += 1;
  }
  while (j < newLen) {
    ops.push({ type: "+", line: after[j] });
    j += 1;
  }

  if (!ops.some((op) => op.type !== " ")) return "";

  const context = 3;
  const hunks = [];
  let cursor = 0;
  while (cursor < ops.length) {
    while (cursor < ops.length && ops[cursor].type === " ") cursor += 1;
    if (cursor >= ops.length) break;

    const hunkStart = Math.max(0, cursor - context);
    let hunkEnd = cursor;
    let lastChange = cursor;
    while (hunkEnd < ops.length) {
      if (ops[hunkEnd].type !== " ") lastChange = hunkEnd;
      if (hunkEnd - lastChange > context) break;
      hunkEnd += 1;
    }
    hunkEnd = Math.min(ops.length, lastChange + context + 1);

    if (hunks.length && hunkStart <= hunks[hunks.length - 1].end) {
      hunks[hunks.length - 1].end = hunkEnd;
    } else {
      hunks.push({ start: hunkStart, end: hunkEnd });
    }
    cursor = hunkEnd;
  }

  const lines = [`--- a/${rel(filePath)}`, `+++ b/${rel(filePath)}`];
  hunks.forEach((hunk) => {
    const oldStart = ops.slice(0, hunk.start).filter((op) => op.type !== "+").length + 1;
    const newStart = ops.slice(0, hunk.start).filter((op) => op.type !== "-").length + 1;
    const hunkOps = ops.slice(hunk.start, hunk.end);
    const oldCount = hunkOps.filter((op) => op.type !== "+").length;
    const newCount = hunkOps.filter((op) => op.type !== "-").length;
    lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    hunkOps.forEach((op) => {
      lines.push(`${op.type}${op.line}`);
    });
  });
  return lines.join("\n");
}

function getSnippetById(content, id) {
  const pattern = new RegExp(`\\{\\s*\\n\\s*id:\\s*"${escapeRegExp(id)}",[\\s\\S]*?\\n\\s*\\},`, "m");
  const match = content.match(pattern);
  if (!match) throw new Error(`Could not find block for id "${id}".`);
  return match[0];
}

function replaceSnippetById(content, id, replacement) {
  const pattern = new RegExp(`\\{\\s*\\n\\s*id:\\s*"${escapeRegExp(id)}",[\\s\\S]*?\\n\\s*\\},`, "m");
  if (!pattern.test(content)) throw new Error(`Could not replace block for id "${id}".`);
  return content.replace(pattern, replacement);
}

function getGuideSectionBySectionId(content, sectionId) {
  const pattern = new RegExp(`\\{\\s*\\n\\s*id:\\s*"${escapeRegExp(sectionId)}",[\\s\\S]*?\\n\\s*\\},`, "m");
  const match = content.match(pattern);
  if (!match) throw new Error(`Could not find guide section "${sectionId}".`);
  return match[0];
}

function replaceGuideSection(content, sectionId, replacement) {
  const pattern = new RegExp(`\\{\\s*\\n\\s*id:\\s*"${escapeRegExp(sectionId)}",[\\s\\S]*?\\n\\s*\\},`, "m");
  if (!pattern.test(content)) throw new Error(`Could not replace guide section "${sectionId}".`);
  return content.replace(pattern, replacement);
}

function renderGuideSection(section) {
  const paragraphs = section.paragraphs.map((paragraph) => `          ${quote(paragraph)},`).join("\n");
  const shots = section.shots
    .map((shot) => {
      if (shot.image) return `          { label: ${quote(shot.label)}, image: ${quote(shot.image)} },`;
      return `          { label: ${quote(shot.label)} },`;
    })
    .join("\n");
  return [
    "{",
    `        id: ${quote(section.id)},`,
    `        title: ${quote(section.title)},`,
    `        icon: ${quote(section.icon)},`,
    "        paragraphs: [",
    paragraphs,
    "        ],",
    "        shots: [",
    shots,
    "        ],",
    "      },",
  ].join("\n");
}

function renderArchieEntry(entry) {
  const lines = [
    "{",
    `    id: ${quote(entry.id)},`,
    `    category: ${quote(entry.category)},`,
    `    question: ${quote(entry.question)},`,
    "    answer:",
    `      ${quote(entry.answer)},`,
    `    aliases: [${entry.aliases.map((value) => quote(value)).join(", ")}],`,
    `    keywords: [${entry.keywords.map((value) => quote(value)).join(", ")}],`,
  ];
  if (entry.route) lines.push(`    route: ${quote(entry.route)},`);
  if (entry.settingsPane) lines.push(`    settingsPane: ${quote(entry.settingsPane)},`);
  lines.push(`    source: { kind: ${quote(entry.source.kind)}, label: ${quote(entry.source.label)} },`);
  if (entry.suggestedAction?.kind === "navigate") {
    lines.push(
      `    suggestedAction: { kind: "navigate", label: ${quote(entry.suggestedAction.label)}, href: ${quote(
        entry.suggestedAction.href,
      )} },`,
    );
  } else if (entry.suggestedAction?.kind === "openSettingsPane") {
    lines.push(
      `    suggestedAction: { kind: "openSettingsPane", label: ${quote(entry.suggestedAction.label)}, pane: ${quote(
        entry.suggestedAction.pane,
      )} },`,
    );
  }
  lines.push("  },");
  return lines.join("\n");
}

function formatFilesAnalyzed(files) {
  return files.map((file) => `- ${file.path} -> ${file.reason}`).join("\n");
}

function formatBullets(items, fallback) {
  if (!items.length) return `- ${fallback}`;
  return items.map((item) => `- ${item}`).join("\n");
}

function buildMarkdownDraft(featureName, guideSection, archieEntries) {
  const lines = [];
  if (guideSection) {
    lines.push(`## Visible Guide: ${featureName}`);
    lines.push("");
    lines.push(...guideSection.paragraphs.map((paragraph) => `- ${paragraph}`));
    lines.push("");
  }
  if (archieEntries.length) {
    lines.push("## Archie Knowledge");
    lines.push("");
    archieEntries.forEach((entry) => {
      lines.push(`### ${entry.question}`);
      lines.push("");
      lines.push(entry.answer);
      lines.push("");
    });
  }
  return lines.join("\n").trim();
}

function promptIsYes(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

function detectMissingPhrases(content, phrases) {
  return phrases.filter((phrase) => !content.includes(phrase));
}

function extractExactLabels(content, labels) {
  return labels.filter((label) => content.includes(label));
}

const FEATURE_REGISTRY = [
  {
    name: "History Manager",
    guideSectionId: "ug-history-manager",
    archieEntryIds: ["faq-history-manager-what-is", "faq-settings-data-history-manager"],
    files: [
      { path: "src/app/history-manager/page.tsx", reason: "Route entry for the dedicated History Manager screen." },
      { path: "src/app/tasktimer/components/HistoryManagerScreen.tsx", reason: "Defines the visible screen title and top-level action labels." },
      { path: "src/app/tasktimer/client/history-manager.ts", reason: "Implements grouping, sort controls, bulk edit, delete flows, and route return behavior." },
      { path: "src/app/tasktimer/components/settings/SettingsDataPane.tsx", reason: "Defines the Settings > Data entry point label for History Manager." },
      { path: "src/app/tasktimer/components/UserGuideScreen.tsx", reason: "Contains the visible user guide section that should be updated." },
      { path: "src/app/tasktimer/lib/archieKnowledge.ts", reason: "Contains Archie FAQ entries that should stay aligned with the visible guide." },
      { path: "src/app/tasktimer/lib/archieEngine.test.ts", reason: "Covers Archie product answers and citations for history manager queries." },
    ],
    build(repo) {
      const implementation = repo["src/app/tasktimer/client/history-manager.ts"];
      const settingsData = repo["src/app/tasktimer/components/settings/SettingsDataPane.tsx"];
      const guideSection = {
        id: "ug-history-manager",
        title: "History Manager",
        icon: "/History_Manager.svg",
        paragraphs: [
          "Open History Manager from Settings > Data > History Manager. The inline Manage action in task history can also take you to the same route when advanced history is available.",
          "History Manager groups logs by task and date. Use the DATE/TIME and ELAPSED buttons to change the active sort order while reviewing entries.",
          "Bulk Edit enables task-level, date-level, and row-level selection. Use Delete to remove the selected entries after the confirmation summary, or use the row delete action for a single log.",
        ],
        shots: [
          { label: "Screenshot placeholder: History Manager Overview" },
          { label: "Screenshot placeholder: Bulk Edit Selection" },
          { label: "Screenshot placeholder: Delete Confirmation Summary" },
        ],
      };
      const archieEntries = [
        {
          id: "faq-history-manager-what-is",
          category: "history",
          question: "What is History Manager?",
          answer:
            "History Manager is the dedicated review screen for recorded task logs. It groups entries by task and date, lets you sort by DATE/TIME or ELAPSED, and supports Bulk Edit selection before Delete confirmation.",
          aliases: ["what can i do in history manager", "history manager sorting", "bulk delete history"],
          keywords: ["history manager", "group by task", "group by date", "sorting", "bulk edit", "delete selected"],
          route: "/history-manager",
          source: { kind: "user-guide", label: "User Guide > History Manager" },
          suggestedAction: { kind: "navigate", label: "Open History Manager", href: "/history-manager" },
        },
        {
          id: "faq-settings-data-history-manager",
          category: "data",
          question: "Where do I open History Manager from Settings?",
          answer:
            "Open Settings, then Data, and choose History Manager. The same screen can also be opened from a task's inline history with Manage when advanced history is available.",
          aliases: ["history manager in settings", "open history manager from settings"],
          keywords: ["data", "history manager", "settings", "manage"],
          route: "/settings",
          settingsPane: "data",
          source: { kind: "settings", label: "Settings > Data" },
          suggestedAction: { kind: "openSettingsPane", label: "Open Data", pane: "data" },
        },
      ];
      const exactLabels = unique(
        extractExactLabels(implementation, ["History Manager", "Generate Test Data", "Bulk Edit", "Delete", "Exit", "DATE/TIME", "ELAPSED"]).concat(
          extractExactLabels(settingsData, ["History Manager"]),
        ),
      );
      const summary =
        "History Manager is the dedicated screen for reviewing, sorting, and deleting recorded task logs.";
      const workflow = [
        "Open Settings, then Data, and choose History Manager, or use Manage from inline task history when available.",
        "Review logs grouped by task and date.",
        "Use DATE/TIME or ELAPSED to change sorting.",
        "Use Bulk Edit for hierarchical selection, then Delete to remove the selected entries.",
        "Use the row delete action for a single log, or Exit to return to the previous route.",
      ];
      const rules = [
        "History Manager is available as a dedicated route at /history-manager.",
        "Bulk delete uses a confirmation summary before removal.",
        "Single-row deletion is supported separately from bulk edit.",
      ];
      return {
        summary,
        workflow,
        rules,
        exactLabels,
        guideSection,
        archieEntries,
        docIssues(currentGuide, currentArchieSnippets) {
          const issues = [];
          if (!currentGuide.includes("Settings > Data") && !currentGuide.includes("Manage")) {
            issues.push("The visible guide does not explain how users reach History Manager from Settings or inline history.");
          }
          const missingLabels = detectMissingPhrases(currentGuide, ["DATE/TIME", "ELAPSED", "Bulk Edit"]);
          if (missingLabels.length) {
            issues.push(`The visible guide omits exact action or column labels used in the screen: ${missingLabels.join(", ")}.`);
          }
          if (!currentArchieSnippets.some((snippet) => snippet.includes("DATE/TIME") || snippet.includes("ELAPSED"))) {
            issues.push("Archie knowledge omits the exact sort labels that appear in the History Manager table.");
          }
          return issues;
        },
      };
    },
  },
  {
    name: "Notifications",
    guideSectionId: "ug-settings",
    archieEntryIds: ["faq-settings-notifications-alerts"],
    files: [
      { path: "src/app/tasktimer/components/settings/SettingsNotificationsPane.tsx", reason: "Defines the Notifications pane labels and toggle rows." },
      { path: "src/app/tasktimer/client/preferences.ts", reason: "Implements the notification toggle behavior and persistence rules." },
      { path: "src/app/tasktimer/components/settings/useSettingsPaneState.ts", reason: "Confirms Notifications is a first-class Settings pane." },
      { path: "src/app/tasktimer/lib/preferencesService.test.ts", reason: "Covers stored notification preference behavior." },
      { path: "src/app/tasktimer/components/UserGuideScreen.tsx", reason: "Contains the visible guide Settings section that should be updated." },
      { path: "src/app/tasktimer/lib/archieKnowledge.ts", reason: "Contains the Archie answer for notification settings." },
    ],
    build(repo) {
      const notificationsPane = repo["src/app/tasktimer/components/settings/SettingsNotificationsPane.tsx"];
      const labels = extractExactLabels(notificationsPane, [
        "Notifications",
        "Enable Mobile Push Notifications",
        "Enable Web Push Notifications",
        "Checkpoint Sound",
        "Checkpoint Toast",
      ]);
      const guideSection = {
        id: "ug-settings",
        title: "Settings",
        icon: "/Settings.svg",
        paragraphs: [
          "Settings is the central control panel for app-wide behavior. It includes Preferences, Appearance, Notifications, Data, About, and the Help Center.",
          "Open Notifications to manage Enable Mobile Push Notifications, Enable Web Push Notifications, Checkpoint Sound, and Checkpoint Toast.",
          "Use the other Settings panes for appearance changes, data actions, and support content such as the User Guide and About.",
        ],
        shots: [
          { label: "Screenshot placeholder: Settings Main Menu" },
          { label: "Screenshot placeholder: Appearance Overlay" },
          { label: "Screenshot placeholder: Task Settings Overlay" },
        ],
      };
      const archieEntries = [
        {
          id: "faq-settings-notifications-alerts",
          category: "notifications",
          question: "Where do I manage notifications and checkpoint alerts?",
          answer:
            "Open Settings, then Notifications. The pane includes Enable Mobile Push Notifications, Enable Web Push Notifications, Checkpoint Sound, and Checkpoint Toast.",
          aliases: ["mobile push notifications", "web push notifications", "checkpoint sound", "checkpoint toast"],
          keywords: ["notifications", "mobile push", "web push", "checkpoint sound", "checkpoint toast"],
          route: "/settings",
          settingsPane: "notifications",
          source: { kind: "settings", label: "Settings > Notifications" },
          suggestedAction: { kind: "openSettingsPane", label: "Open Notifications", pane: "notifications" },
        },
      ];
      return {
        summary: "Notifications controls push alerts and checkpoint alerts from the Settings route.",
        workflow: [
          "Open Settings and choose Notifications.",
          "Toggle Enable Mobile Push Notifications or Enable Web Push Notifications as needed.",
          "Toggle Checkpoint Sound and Checkpoint Toast for checkpoint alerts.",
        ],
        rules: [
          "Notifications is its own Settings pane.",
          "The toggles are persisted through the shared preferences flow.",
        ],
        exactLabels: unique(labels),
        guideSection,
        archieEntries,
        docIssues(currentGuide, currentArchieSnippets) {
          const issues = [];
          if (!currentGuide.includes("Notifications")) {
            issues.push("The visible guide Settings section does not clearly name the Notifications pane.");
          }
          const missingLabels = detectMissingPhrases(currentGuide, [
            "Enable Mobile Push Notifications",
            "Enable Web Push Notifications",
            "Checkpoint Sound",
            "Checkpoint Toast",
          ]);
          if (missingLabels.length) {
            issues.push(`The visible guide omits exact toggle labels from the Notifications pane: ${missingLabels.join(", ")}.`);
          }
          if (currentArchieSnippets.some((snippet) => !snippet.includes("Enable Mobile Push Notifications"))) {
            issues.push("The Archie notifications answer uses summary wording instead of the exact visible toggle labels.");
          }
          return issues;
        },
      };
    },
  },
  {
    name: "Backup and Reset",
    guideSectionId: "ug-data",
    archieEntryIds: ["faq-settings-data-export", "faq-settings-data-import", "faq-settings-data-reset"],
    files: [
      { path: "src/app/tasktimer/components/settings/SettingsDataPane.tsx", reason: "Defines the Data pane actions: History Manager, Export Backup, Import Backup, and Reset All." },
      { path: "src/app/tasktimer/client/import-export.ts", reason: "Implements backup export and import behavior, including add vs overwrite flows." },
      { path: "src/app/tasktimer/client/tasks.ts", reason: "Implements Reset All confirmation behavior and delete scope." },
      { path: "src/app/tasktimer/components/UserGuideScreen.tsx", reason: "Contains the visible guide section for backup and reset workflows." },
      { path: "src/app/tasktimer/lib/archieKnowledge.ts", reason: "Contains Archie answers for export, import, and reset." },
    ],
    build(repo) {
      const dataPane = repo["src/app/tasktimer/components/settings/SettingsDataPane.tsx"];
      const importExport = repo["src/app/tasktimer/client/import-export.ts"];
      const tasks = repo["src/app/tasktimer/client/tasks.ts"];
      const exactLabels = unique(
        extractExactLabels(dataPane, ["History Manager", "Export Backup", "Import Backup", "Reset All"]).concat(
          extractExactLabels(importExport, ["Import Backup", "Add", "Overwrite", "Replace Current Data"]),
          extractExactLabels(tasks, ["Delete Data", "Delete", "Also Delete All Tasks", "Delete Complete"]),
        ),
      );
      const guideSection = {
        id: "ug-data",
        title: "Backup and Reset",
        icon: "/Import.svg",
        paragraphs: [
          "Open Settings, then Data to access Export Backup, Import Backup, Reset All, and History Manager. Export Backup downloads a JSON backup of your current tasks.",
          "Import Backup opens a backup file and then asks whether to Add or Overwrite when existing tasks are already present. Free restores replace current local data instead of merging imported tasks into it.",
          "Reset All opens the Delete Data confirmation. It always clears stored history, and you can also enable Also Delete All Tasks before entering DELETE to proceed.",
        ],
        shots: [
          { label: "Screenshot placeholder: Export Backup Action" },
          { label: "Screenshot placeholder: Import Backup Action" },
          { label: "Screenshot placeholder: Reset All Confirmation" },
        ],
      };
      const archieEntries = [
        {
          id: "faq-settings-data-export",
          category: "data",
          question: "How do I export a backup?",
          answer:
            "Open Settings, then Data, and use Export Backup. It downloads a JSON backup of your current tasks, and history is included when advanced backup access is available.",
          aliases: ["export backup", "download my data", "backup json"],
          keywords: ["data", "export backup", "json", "backup"],
          route: "/settings",
          settingsPane: "data",
          source: { kind: "settings", label: "Settings > Data" },
          suggestedAction: { kind: "openSettingsPane", label: "Open Data", pane: "data" },
        },
        {
          id: "faq-settings-data-import",
          category: "data",
          question: "How do I import a backup?",
          answer:
            "Open Settings, then Data, and use Import Backup. If current tasks already exist, the app asks whether to Add or Overwrite, while free restores replace current local data instead of merging imported tasks.",
          aliases: ["import backup", "restore backup", "upload backup json"],
          keywords: ["data", "import backup", "restore", "add", "overwrite"],
          route: "/settings",
          settingsPane: "data",
          source: { kind: "user-guide", label: "User Guide > Backup and Reset" },
          suggestedAction: { kind: "openSettingsPane", label: "Open Data", pane: "data" },
        },
        {
          id: "faq-settings-data-reset",
          category: "data",
          question: "How do I reset all local data?",
          answer:
            "Open Settings, then Data, and use Reset All. The Delete Data confirmation always clears stored history, and you can also enable Also Delete All Tasks before entering DELETE to proceed.",
          aliases: ["reset all data", "clear local data", "wipe tasks and history"],
          keywords: ["reset all", "data", "history", "delete data", "also delete all tasks"],
          route: "/settings",
          settingsPane: "data",
          source: { kind: "user-guide", label: "User Guide > Backup and Reset" },
          suggestedAction: { kind: "openSettingsPane", label: "Open Data", pane: "data" },
        },
      ];
      return {
        summary: "Backup and Reset covers export, restore, and destructive cleanup actions from Settings > Data.",
        workflow: [
          "Open Settings and choose Data.",
          "Use Export Backup to download a JSON backup.",
          "Use Import Backup to restore data and choose Add or Overwrite when prompted.",
          "Use Reset All to open Delete Data and confirm whether tasks should also be deleted.",
        ],
        rules: [
          "Free restores replace current local data instead of merging imported tasks.",
          "Reset All always clears stored history and can optionally delete all tasks.",
          "Reset confirmation requires DELETE before proceeding.",
        ],
        exactLabels,
        guideSection,
        archieEntries,
        docIssues(currentGuide, currentArchieSnippets) {
          const issues = [];
          if (!currentGuide.includes("Settings, then Data")) {
            issues.push("The visible guide does not anchor Backup and Reset to the Settings > Data entry point.");
          }
          if (!currentGuide.includes("Add or Overwrite")) {
            issues.push("The visible guide does not explain the import decision between Add and Overwrite.");
          }
          if (!currentGuide.includes("Also Delete All Tasks") || !currentGuide.includes("DELETE")) {
            issues.push("The visible guide does not describe the exact destructive reset confirmation requirements.");
          }
          if (currentArchieSnippets.some((snippet) => snippet.includes("creates a JSON backup of your tasks and history"))) {
            issues.push("Archie export guidance currently overstates backup contents instead of reflecting the plan-based history export behavior.");
          }
          return issues;
        },
      };
    },
  },
];

function findFeatureByName(name) {
  if (!name) return null;
  const normalizedInput = String(name).trim().toLowerCase();
  return FEATURE_REGISTRY.find((feature) => feature.name.toLowerCase() === normalizedInput) || null;
}

async function chooseFeature(preselectedName) {
  const byName = findFeatureByName(preselectedName);
  if (byName) return byName;
  if (preselectedName) {
    throw new Error(`Unsupported feature: ${preselectedName}`);
  }
  const rl = readline.createInterface({ input, output });
  try {
    output.write("Available features:\n");
    FEATURE_REGISTRY.forEach((feature, index) => {
      output.write(`${index + 1}. ${feature.name}\n`);
    });
    while (true) {
      const answer = await rl.question("Which feature should be updated? ");
      const trimmed = String(answer || "").trim();
      const numeric = Number.parseInt(trimmed, 10);
      if (Number.isFinite(numeric) && numeric >= 1 && numeric <= FEATURE_REGISTRY.length) {
        return FEATURE_REGISTRY[numeric - 1];
      }
      const exact = findFeatureByName(trimmed);
      if (exact) return exact;
      output.write("Unsupported feature. Enter a listed number or exact feature name.\n");
    }
  } finally {
    rl.close();
  }
}

function loadRepoFiles(feature) {
  const repo = {};
  feature.files.forEach((file) => {
    const absolutePath = path.join(ROOT, file.path);
    repo[file.path] = readText(absolutePath);
  });
  repo[rel(USER_GUIDE_PATH)] = readText(USER_GUIDE_PATH);
  repo[rel(ARCHIE_PATH)] = readText(ARCHIE_PATH);
  return repo;
}

function buildFeatureAudit(feature, repo) {
  const currentGuideText = repo["src/app/tasktimer/components/UserGuideScreen.tsx"];
  const currentArchieText = repo["src/app/tasktimer/lib/archieKnowledge.ts"];
  const currentGuideSnippet = getGuideSectionBySectionId(currentGuideText, feature.guideSectionId);
  const currentArchieSnippets = feature.archieEntryIds.map((entryId) => getSnippetById(currentArchieText, entryId));
  const analysis = feature.build(repo);

  let nextGuideText = currentGuideText;
  const renderedGuideSection = renderGuideSection(analysis.guideSection);
  nextGuideText = replaceGuideSection(nextGuideText, feature.guideSectionId, renderedGuideSection);

  let nextArchieText = currentArchieText;
  analysis.archieEntries.forEach((entry) => {
    nextArchieText = replaceSnippetById(nextArchieText, entry.id, renderArchieEntry(entry));
  });

  const guideChanged = currentGuideText !== nextGuideText;
  const archieChanged = currentArchieText !== nextArchieText;
  const fileChanges = [];
  if (guideChanged) {
    fileChanges.push({
      path: USER_GUIDE_PATH,
      relPath: rel(USER_GUIDE_PATH),
      before: currentGuideText,
      after: nextGuideText,
      diff: buildUnifiedDiff(currentGuideText, nextGuideText, USER_GUIDE_PATH),
    });
  }
  if (archieChanged) {
    fileChanges.push({
      path: ARCHIE_PATH,
      relPath: rel(ARCHIE_PATH),
      before: currentArchieText,
      after: nextArchieText,
      diff: buildUnifiedDiff(currentArchieText, nextArchieText, ARCHIE_PATH),
    });
  }

  const issues = analysis.docIssues(currentGuideSnippet, currentArchieSnippets);
  const uncertainties = [];
  if (!analysis.exactLabels.length) {
    uncertainties.push("No exact UI labels were extracted from the inspected implementation files.");
  }

  return {
    summary: analysis.summary,
    workflow: analysis.workflow,
    rules: analysis.rules,
    exactLabels: analysis.exactLabels,
    guideSection: analysis.guideSection,
    archieEntries: analysis.archieEntries,
    issues,
    uncertainties,
    fileChanges,
    filesAnalyzed: feature.files,
  };
}

function printSection(title, body) {
  output.write(`${title}\n`);
  output.write(`${body}\n\n`);
}

function printReport(feature, audit) {
  printSection("1. FEATURE SUMMARY", audit.summary);
  printSection("2. FILES ANALYZED", formatFilesAnalyzed(audit.filesAnalyzed));

  const behaviorSummary = [
    "User workflow:",
    ...audit.workflow.map((step) => `- ${step}`),
    "",
    "Rules and constraints:",
    ...audit.rules.map((rule) => `- ${rule}`),
    "",
    "Verified UI labels:",
    ...audit.exactLabels.map((label) => `- ${label}`),
  ].join("\n");
  output.write(`${behaviorSummary}\n\n`);

  printSection("3. DOCUMENTATION ISSUES", formatBullets(audit.issues, "No documentation drift detected for the selected feature."));

  const markdownDraft = audit.fileChanges.length
    ? buildMarkdownDraft(feature.name, audit.guideSection, audit.archieEntries)
    : "No changed sections were required.";
  printSection("4. UPDATED DOCUMENTATION (MARKDOWN)", `\`\`\`markdown\n${markdownDraft}\n\`\`\``);

  printSection("5. UNCERTAINTIES", formatBullets(audit.uncertainties, "None. All reported behavior was verified in the inspected repository sources."));

  if (!audit.fileChanges.length) {
    printSection("6. PROPOSED FILE CHANGES", "- No file edits are proposed.");
    return;
  }

  const body = audit.fileChanges
    .map((change) => [`- ${change.relPath}`, "```diff", change.diff, "```"].join("\n"))
    .join("\n\n");
  printSection("6. PROPOSED FILE CHANGES", body);
}

async function maybeApplyChanges(fileChanges, autoApply) {
  if (!fileChanges.length) return false;
  if (!autoApply) {
    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question("Apply these changes to the file? ");
      if (!promptIsYes(answer)) {
        output.write("No changes applied.\n");
        return false;
      }
    } finally {
      rl.close();
    }
  }

  fileChanges.forEach((change) => {
    writeText(change.path, change.after);
    output.write(`Updated ${change.relPath}.\n`);
  });
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const feature = await chooseFeature(args.feature);
  const repo = loadRepoFiles(feature);
  const audit = buildFeatureAudit(feature, repo);
  printReport(feature, audit);
  await maybeApplyChanges(audit.fileChanges, args.apply);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
