import type { ArchieKnowledgeCitation, ArchieSettingsPane } from "./archieAssistant";

type ArchieRoute = "/tasklaunch" | "/dashboard" | "/settings" | "/history-manager" | "/feedback" | "/leaderboard";

type ArchieKnowledgeEntry = {
  id: string;
  category: string;
  question: string;
  answer: string;
  aliases: string[];
  keywords: string[];
  route?: ArchieRoute;
  settingsPane?: ArchieSettingsPane;
  source: {
    kind: "settings" | "policy";
    label: string;
  };
  suggestedAction?:
    | { kind: "navigate"; label: string; href: string }
    | { kind: "openSettingsPane"; label: string; pane: ArchieSettingsPane };
};

export type ArchieKnowledgeMatch = {
  entry: ArchieKnowledgeEntry;
  score: number;
  matchedTokenCount: number;
  matchedKeywordCount: number;
  matchedKeywordTokenCount: number;
  matchedPhraseCount: number;
  unmatchedTokenCount: number;
};

const ARCHIE_KNOWLEDGE_BASE: ArchieKnowledgeEntry[] = [
  {
    id: "faq-history-manager-what-is",
    category: "history",
    question: "What is History Manager?",
    answer:
      "History Manager is the dedicated review screen for recorded task logs. It groups entries by task and date, lets you sort by DATE/TIME or ELAPSED, and supports Bulk Edit selection before Delete confirmation.",
    aliases: ["what can i do in history manager", "history manager sorting", "bulk delete history"],
    keywords: ["history manager", "group by task", "group by date", "DATE/TIME", "ELAPSED", "Bulk Edit", "Delete"],
    route: "/history-manager",
    settingsPane: "data",
    source: { kind: "settings", label: "Settings > Data" },
    suggestedAction: { kind: "navigate", label: "Open History Manager", href: "/history-manager" },
  },
  {
    id: "faq-history-manager-manual-entry",
    category: "history",
    question: "Can I add a manual history entry?",
    answer:
      "Yes. History Manager manual entries include Date/Time, Elapsed hours and minutes, Sentiment, and optional Notes, then feed the same history used by charts, Dashboard, and Focus Mode.",
    aliases: ["add manual history", "manual log", "manual history note", "sentiment"],
    keywords: ["manual history entry", "Date/Time", "Elapsed", "Sentiment", "Notes", "History Manager"],
    route: "/history-manager",
    settingsPane: "data",
    source: { kind: "settings", label: "Settings > Data" },
    suggestedAction: { kind: "navigate", label: "Open History Manager", href: "/history-manager" },
  },
  {
    id: "faq-settings-what-is",
    category: "settings",
    question: "What can I configure in Settings?",
    answer:
      "Settings includes Account, Preferences, Appearance, Notifications, Help Center, Data, and About. Desktop opens Account by default, while mobile starts from the module list unless a pane is requested.",
    aliases: ["what is in settings", "settings sections", "where are app settings"],
    keywords: ["settings", "preferences", "appearance", "notifications", "data", "privacy", "feedback", "about", "help center"],
    route: "/settings",
    source: { kind: "settings", label: "Settings > Overview" },
    suggestedAction: { kind: "navigate", label: "Open Settings", href: "/settings" },
  },
  {
    id: "faq-settings-appearance-theme",
    category: "appearance",
    question: "Where do I change the theme?",
    answer: "Open Settings, then Appearance. The Appearance pane lets you change the color theme and load appearance defaults.",
    aliases: ["change theme", "color theme", "appearance settings", "theme settings"],
    keywords: ["appearance", "theme", "color theme", "load defaults"],
    route: "/settings",
    settingsPane: "appearance",
    source: { kind: "settings", label: "Settings > Appearance" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Appearance", pane: "appearance" },
  },
  {
    id: "faq-settings-preferences-task-view",
    category: "preferences",
    question: "Where do I change task behavior defaults?",
    answer:
      "Open Settings, then Preferences. Preferences includes Auto switch to Focus Mode on launch, Load Module on App Startup, Week Starts On, Optimal Productivity Period, and Load Defaults.",
    aliases: ["task settings defaults", "week starts on", "auto focus on launch"],
    keywords: ["Preferences", "Auto switch to Focus Mode on launch", "Load Module on App Startup", "Week Starts On", "Optimal Productivity Period", "Load Defaults"],
    route: "/settings",
    settingsPane: "preferences",
    source: { kind: "settings", label: "Settings > Preferences" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Preferences", pane: "preferences" },
  },
  {
    id: "faq-settings-notifications-alerts",
    category: "notifications",
    question: "Where do I manage notifications and checkpoint alerts?",
    answer:
      "Open Settings, then Notifications. The pane includes Enable Mobile Push Notifications, Enable Web Push Notifications, Checkpoint Sound, and Checkpoint Toast.",
    aliases: ["mobile push notifications", "web push notifications", "checkpoint sound", "checkpoint toast"],
    keywords: ["Notifications", "Enable Mobile Push Notifications", "Enable Web Push Notifications", "Checkpoint Sound", "Checkpoint Toast"],
    route: "/settings",
    settingsPane: "notifications",
    source: { kind: "settings", label: "Settings > Notifications" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Notifications", pane: "notifications" },
  },
  {
    id: "faq-account-profile",
    category: "account",
    question: "What can I manage in Account settings?",
    answer:
      "Account shows plan status, current rank, username, email address, UID, member since date, sync status, avatar choices, rank ladder access, and Delete Account confirmation.",
    aliases: ["account settings", "profile card", "copy uid", "delete account"],
    keywords: ["Account", "Free User", "Pro User", "Current Rank", "Username", "UID", "Member Since", "Delete Account"],
    route: "/settings",
    settingsPane: "general",
    source: { kind: "settings", label: "Settings > Account" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Account", pane: "general" },
  },
  {
    id: "faq-account-avatar-rank",
    category: "account",
    question: "How do avatars and the rank ladder work?",
    answer:
      "In Account, tap the avatar to choose an included avatar or upload an image. Use the rank button to open the rank ladder and choose a rank insignia when progress allows it.",
    aliases: ["choose avatar", "upload avatar", "rank ladder", "rank insignia"],
    keywords: ["avatar", "Upload", "rank ladder", "rank insignia", "Current Rank"],
    route: "/settings",
    settingsPane: "general",
    source: { kind: "settings", label: "Settings > Account" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Account", pane: "general" },
  },
  {
    id: "faq-settings-data-export",
    category: "data",
    question: "How do I export a backup?",
    answer:
      "Open Settings, then Data, and use Export Backup. It downloads a JSON backup of supported task data, and the action can show Pro feature lock messaging for Free users.",
    aliases: ["export backup", "download my data", "backup json"],
    keywords: ["Data", "Export Backup", "JSON", "backup", "Pro feature"],
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
      "Open Settings, then Data, and use Import Backup. It opens a JSON file and may ask whether to Add or Overwrite when current data already exists.",
    aliases: ["import backup", "restore backup", "upload backup json"],
    keywords: ["Data", "Import Backup", "JSON", "Add", "Overwrite", "restore"],
    route: "/settings",
    settingsPane: "data",
    source: { kind: "settings", label: "Settings > Data" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Data", pane: "data" },
  },
  {
    id: "faq-settings-data-reset",
    category: "data",
    question: "How do I reset all local data?",
    answer:
      "Open Settings, then Data, and use Reset All. Delete Data always clears stored history, and you can enable Also Delete All Tasks before entering DELETE to proceed.",
    aliases: ["reset all data", "clear local data", "wipe tasks and history"],
    keywords: ["Reset All", "Delete Data", "Also Delete All Tasks", "DELETE", "history", "local data"],
    route: "/settings",
    settingsPane: "data",
    source: { kind: "settings", label: "Settings > Data" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Data", pane: "data" },
  },
  {
    id: "faq-settings-data-history-manager",
    category: "data",
    question: "Where do I open History Manager from Settings?",
    answer:
      "Open Settings, then Data, and choose History Manager. The same screen can also be opened from a task's inline history with Manage when advanced history is available.",
    aliases: ["history manager in settings", "open history manager from settings"],
    keywords: ["Data", "History Manager", "Settings", "Manage"],
    route: "/settings",
    settingsPane: "data",
    source: { kind: "settings", label: "Settings > Data" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Data", pane: "data" },
  },
  {
    id: "faq-settings-support",
    category: "support",
    question: "Where are About, Feedback, and Privacy Policy?",
    answer:
      "Open Settings, then Help Center for Privacy Policy and Feedback. About is its own Settings module with the product summary.",
    aliases: ["where is about", "where is feedback", "where is privacy policy", "support links"],
    keywords: ["Help Center", "Privacy Policy", "Feedback", "About", "settings support"],
    route: "/settings",
    settingsPane: "help",
    source: { kind: "settings", label: "Settings > Help Center" },
    suggestedAction: { kind: "navigate", label: "Open Settings", href: "/settings" },
  },
  {
    id: "faq-feedback-screenshots",
    category: "feedback",
    question: "How do I send feedback with screenshots?",
    answer:
      "Open Feedback from Settings > Help Center or /feedback. Fill Email Address, Feedback Type, Title, and Details. Paste screenshots into Details, then remove attachments if needed before Submit Feedback.",
    aliases: ["submit feedback", "paste screenshot", "bug report", "feature request"],
    keywords: ["Feedback", "Email Address", "Feedback Type", "Title", "Details", "Submit Feedback", "screenshots", "attachments"],
    route: "/feedback",
    settingsPane: "help",
    source: { kind: "settings", label: "Settings > Help Center" },
    suggestedAction: { kind: "navigate", label: "Open Feedback", href: "/feedback" },
  },
  {
    id: "faq-troubleshooting-dynamic-colors",
    category: "troubleshooting",
    question: "Why do my chart or progress colors look wrong?",
    answer:
      "Check whether dynamic colors is enabled in your settings. If dynamic colors is disabled, the app falls back to a default accent instead of progress-based color changes.",
    aliases: ["chart colors wrong", "progress colors wrong", "dynamic colors"],
    keywords: ["dynamic colors", "chart colors", "progress bar colors", "default accent"],
    route: "/settings",
    settingsPane: "appearance",
    source: { kind: "settings", label: "Settings > Appearance" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Appearance", pane: "appearance" },
  },
  {
    id: "faq-troubleshooting-notifications",
    category: "troubleshooting",
    question: "Why are checkpoint notifications not appearing?",
    answer:
      "Check Settings > Notifications for Enable Mobile Push Notifications, Enable Web Push Notifications, Checkpoint Sound, and Checkpoint Toast. Also confirm the task has checkpoint alerts enabled.",
    aliases: ["checkpoint notifications not working", "push alerts not working", "sound alert missing", "toast alert missing"],
    keywords: ["Notifications", "Enable Mobile Push Notifications", "Enable Web Push Notifications", "Checkpoint Sound", "Checkpoint Toast", "checkpoint alerts"],
    route: "/settings",
    settingsPane: "notifications",
    source: { kind: "settings", label: "Settings > Notifications" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Notifications", pane: "notifications" },
  },
  {
    id: "faq-archie-product-limits",
    category: "archie",
    question: "Can Archie answer anything about the product?",
    answer:
      "No. Archie answers product questions from current TaskLaunch documentation, settings surfaces, and product policy entries. If the available documentation does not support an answer, Archie should say that directly.",
    aliases: ["when does archie say it does not know", "archie product knowledge", "archie support limits"],
    keywords: ["archie", "documentation", "does not know", "product support"],
    route: "/settings",
    source: { kind: "policy", label: "Archie Product Support Policy" },
  },
  {
    id: "faq-archie-draft-approval",
    category: "archie",
    question: "Can Archie change my schedule automatically?",
    answer:
      "No. Archie can prepare reviewable drafts for task order or schedule changes, but it does not apply them without your approval in Archie Draft Review.",
    aliases: ["does archie auto apply changes", "archie schedule draft", "archie workflow changes"],
    keywords: ["archie", "draft", "reviewable", "schedule changes", "approval"],
    route: "/tasklaunch",
    source: { kind: "policy", label: "Archie Workflow Policy" },
  },
];

function tokenize(value: string) {
  const stopwords = new Set([
    "a",
    "about",
    "an",
    "and",
    "app",
    "are",
    "assistant",
    "can",
    "do",
    "does",
    "explain",
    "for",
    "help",
    "how",
    "i",
    "in",
    "is",
    "it",
    "know",
    "me",
    "my",
    "of",
    "on",
    "or",
    "please",
    "show",
    "tell",
    "the",
    "to",
    "what",
    "where",
    "with",
  ]);
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => !!token && !stopwords.has(token));
}

function entryTerms(entry: ArchieKnowledgeEntry) {
  return [entry.question, ...entry.aliases, ...entry.keywords];
}

export function searchArchieKnowledge(query: string): ArchieKnowledgeMatch[] {
  const normalizedQuery = String(query || "").toLowerCase();
  const tokens = tokenize(normalizedQuery);
  if (!tokens.length) return [];

  return [...ARCHIE_KNOWLEDGE_BASE]
    .map((entry) => {
      const corpusTokens = new Set(
        tokenize(
          [
            entry.category,
            entry.question,
            entry.answer,
            ...entry.aliases,
            ...entry.keywords,
            entry.source.label,
            entry.route || "",
            entry.settingsPane || "",
          ].join(" ")
        )
      );
      const matchedTokens = tokens.filter((token) => corpusTokens.has(token));
      const matchedTerms = entryTerms(entry).filter((term) => {
        const termTokens = tokenize(term);
        if (!termTokens.length) return false;
        return normalizedQuery.includes(term.toLowerCase()) || termTokens.every((token) => tokens.includes(token));
      });
      const matchedKeywordTokenCount = matchedTerms.reduce((sum, term) => sum + tokenize(term).length, 0);
      const matchedPhraseCount = matchedTerms.filter((term) => tokenize(term).length > 1 && normalizedQuery.includes(term.toLowerCase())).length;
      const score =
        matchedTokens.length +
        matchedTerms.reduce((sum, term) => sum + Math.max(2, tokenize(term).length * 3), 0) +
        (entry.route && normalizedQuery.includes(entry.route.replace("/", "")) ? 2 : 0) +
        (entry.settingsPane && normalizedQuery.includes(entry.settingsPane.toLowerCase()) ? 3 : 0);
      return {
        entry,
        score,
        matchedTokenCount: matchedTokens.length,
        matchedKeywordCount: matchedTerms.length,
        matchedKeywordTokenCount,
        matchedPhraseCount,
        unmatchedTokenCount: Math.max(0, tokens.length - matchedTokens.length),
      } satisfies ArchieKnowledgeMatch;
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function toCitation(entry: ArchieKnowledgeEntry): ArchieKnowledgeCitation {
  return {
    id: entry.id,
    title: entry.source.label,
    section: entry.question,
    route: entry.route,
    settingsPane: entry.settingsPane,
    sourceKind: entry.source.kind,
  };
}
