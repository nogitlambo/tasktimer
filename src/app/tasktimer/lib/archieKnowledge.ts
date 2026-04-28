import type { ArchieKnowledgeCitation, ArchieSettingsPane } from "./archieAssistant";

type ArchieRoute = "/tasklaunch" | "/dashboard" | "/settings" | "/history-manager" | "/user-guide" | "/feedback";

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
    kind: "user-guide" | "settings" | "policy";
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
    id: "faq-overview-what-is-tasklaunch",
    category: "overview",
    question: "What is TaskLaunch?",
    answer:
      "TaskLaunch is a multi-task time tracking app for focused work. The core flows are tracking tasks, reviewing history, configuring settings, and managing backups.",
    aliases: ["what is timebase", "what does this app do", "what is the app for"],
    keywords: ["overview", "tasklaunch", "timebase", "focused work", "multi-task time tracking"],
    route: "/user-guide",
    source: { kind: "user-guide", label: "User Guide > Overview" },
    suggestedAction: { kind: "navigate", label: "Open User Guide", href: "/user-guide" },
  },
  {
    id: "faq-navigation-footer-pages",
    category: "navigation",
    question: "How do I move between the main pages?",
    answer:
      "Use the footer bar to move between Dashboard, Tasks, and the other app pages. Settings opens as its own route.",
    aliases: ["where is dashboard", "where is tasks", "how do i open settings", "how do i navigate the app"],
    keywords: ["footer", "navigation", "dashboard", "tasks", "settings route"],
    route: "/user-guide",
    source: { kind: "user-guide", label: "User Guide > Modules" },
    suggestedAction: { kind: "navigate", label: "Open User Guide", href: "/user-guide" },
  },
  {
    id: "faq-tasks-create-first-task",
    category: "tasks",
    question: "How do I create and start my first task?",
    answer:
      "Use Add Task to create a task, then press Start to begin timing. Use Stop to pause and Start again to resume.",
    aliases: ["how do i add a task", "how do i start timing", "how do i start a timer"],
    keywords: ["add task", "start", "stop", "resume", "create first task"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Quick Start" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-tasks-reset-history",
    category: "tasks",
    question: "What does Reset do?",
    answer:
      "Reset clears the active timer and can log the finished session to history, depending on the reset flow you choose.",
    aliases: ["what happens when i reset a task", "does reset save history"],
    keywords: ["reset", "log session", "history", "clear timer"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Quick Start" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-tasks-row-actions",
    category: "tasks",
    question: "What actions are available on a task row?",
    answer:
      "Each task row includes Start or Stop, Reset, Edit, History, and a more-actions menu. Duplicate, Collapse, and Delete are available from the task controls.",
    aliases: ["what can i do with a task", "where is edit task", "where is duplicate task", "where is delete task"],
    keywords: ["task row", "edit", "duplicate", "delete", "collapse", "history"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Tasks" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-tasks-manual-edits",
    category: "tasks",
    question: "Do manual task edits create history?",
    answer:
      "No. Manual edits change the task timer value, but they do not create a history entry until a reset is logged.",
    aliases: ["does editing accumulated time add history", "manual edit history", "edit task time history"],
    keywords: ["manual edit", "accumulated time", "history entry", "edit task"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Tasks" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-timers-checkpoints",
    category: "timers",
    question: "How do checkpoints and milestones work?",
    answer:
      "Milestones can be enabled per task in Edit. You choose day, hour, or minute units, and the visuals update as elapsed time reaches each checkpoint.",
    aliases: ["how do i set checkpoints", "how do milestones work", "checkpoint unit"],
    keywords: ["checkpoints", "milestones", "day", "hour", "minute", "task edit"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Timers and Checkpoints" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-history-inline",
    category: "history",
    question: "What can I do in Inline History?",
    answer:
      "Inline History shows recent session entries as bars for a task. You can switch between 7-day and 14-day ranges, page through entries, pin the panel, and use Analyse or Manage from the footer.",
    aliases: ["what does pin do", "how do i analyse history", "inline history features"],
    keywords: ["inline history", "7-day", "14-day", "pin", "analyse", "manage"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > History" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-history-pin",
    category: "history",
    question: "What does Pin do in history?",
    answer: "Pin keeps a task history panel open so you can keep that chart visible for quick reference.",
    aliases: ["pin history", "pinned history panel", "keep history open"],
    keywords: ["pin", "history panel", "inline history"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > History" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-history-manager-what-is",
    category: "history",
    question: "What is History Manager?",
    answer:
      "History Manager is the full view for recorded entries. It groups entries by task and date, supports sorting by date, time, or duration, and supports hierarchical bulk selection for deletion.",
    aliases: ["what can i do in history manager", "history manager sorting", "bulk delete history"],
    keywords: ["history manager", "group by task", "group by date", "sorting", "bulk selection"],
    route: "/history-manager",
    source: { kind: "user-guide", label: "User Guide > History Manager" },
    suggestedAction: { kind: "navigate", label: "Open History Manager", href: "/history-manager" },
  },
  {
    id: "faq-focus-mode-open",
    category: "focus",
    question: "How do I open Focus Mode?",
    answer:
      "Open Focus Mode by selecting a task name. Focus Mode gives a large task-specific view with a dial, formatted elapsed time, checkpoint markers, and focused controls.",
    aliases: ["how do i open focus mode", "what is focus mode", "task focus view"],
    keywords: ["focus mode", "task name", "dial", "single-task view"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Focus Mode" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-focus-insights",
    category: "focus",
    question: "Where do Focus Mode insights come from?",
    answer: "Focus insights are derived from your task history, including values such as best session and trend deltas.",
    aliases: ["focus insights source", "best session in focus mode", "focus trend deltas"],
    keywords: ["focus insights", "task history", "best session", "trend deltas"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Focus Mode" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-settings-what-is",
    category: "settings",
    question: "What can I configure in Settings?",
    answer:
      "Settings is the central control panel for app-wide behavior. It includes preferences, appearance, notifications, data tools, privacy, feedback, and support surfaces such as About and User Guide.",
    aliases: ["what is in settings", "settings sections", "where are app settings"],
    keywords: ["settings", "preferences", "appearance", "notifications", "data", "privacy", "feedback", "about", "user guide"],
    route: "/settings",
    source: { kind: "user-guide", label: "User Guide > Settings" },
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
      "Open Settings, then Preferences. The Preferences pane includes auto-switch to Focus Mode on launch, task view, week start, and a load-defaults control.",
    aliases: ["task settings defaults", "task view setting", "week starts on", "auto focus on launch"],
    keywords: ["preferences", "task view", "week starts on", "auto switch to focus mode", "load defaults"],
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
      "Open Settings, then Notifications. The Notifications pane controls mobile push, web push, checkpoint sound, and checkpoint toast alerts.",
    aliases: ["mobile push notifications", "web push notifications", "checkpoint sound", "checkpoint toast"],
    keywords: ["notifications", "mobile push", "web push", "checkpoint sound", "checkpoint toast"],
    route: "/settings",
    settingsPane: "notifications",
    source: { kind: "settings", label: "Settings > Notifications" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Notifications", pane: "notifications" },
  },
  {
    id: "faq-settings-data-export",
    category: "data",
    question: "How do I export a backup?",
    answer:
      "Open Settings, then Data, and use Export Backup. Export creates a JSON backup of your tasks and history so you can keep recovery snapshots.",
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
      "Open Settings, then Data, and use Import Backup. Imported tasks are normalized and re-keyed when IDs collide so existing tasks are not overwritten directly.",
    aliases: ["import backup", "restore backup", "upload backup json"],
    keywords: ["data", "import backup", "restore", "id collisions", "normalize"],
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
      "Open Settings, then Data, and use Reset All. Reset operations have confirmation steps and affect active timer state and stored history, so export a backup first.",
    aliases: ["reset all data", "clear local data", "wipe tasks and history"],
    keywords: ["reset all", "data", "history", "backup first", "local data"],
    route: "/settings",
    settingsPane: "data",
    source: { kind: "user-guide", label: "User Guide > Backup and Reset" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Data", pane: "data" },
  },
  {
    id: "faq-settings-data-history-manager",
    category: "data",
    question: "Where do I open History Manager from Settings?",
    answer: "Open Settings, then Data, and choose History Manager.",
    aliases: ["history manager in settings", "open history manager from settings"],
    keywords: ["data", "history manager", "settings"],
    route: "/settings",
    settingsPane: "data",
    source: { kind: "settings", label: "Settings > Data" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Data", pane: "data" },
  },
  {
    id: "faq-settings-support",
    category: "support",
    question: "Where are About, Feedback, and User Guide?",
    answer:
      "Those support surfaces are available from Settings. User Guide, About, and Feedback each have their own pane in the Settings route.",
    aliases: ["where is about", "where is user guide", "where is feedback", "support links"],
    keywords: ["about", "user guide", "feedback", "settings support"],
    route: "/settings",
    source: { kind: "user-guide", label: "User Guide > Settings" },
    suggestedAction: { kind: "navigate", label: "Open Settings", href: "/settings" },
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
    source: { kind: "user-guide", label: "User Guide > Troubleshooting" },
    suggestedAction: { kind: "openSettingsPane", label: "Open Appearance", pane: "appearance" },
  },
  {
    id: "faq-archie-product-limits",
    category: "archie",
    question: "Can Archie answer anything about the product?",
    answer:
      "No. Archie answers product questions from the current TaskLaunch documentation and settings surfaces. If the available documentation does not support an answer, Archie should say that directly.",
    aliases: ["when does archie say it does not know", "archie product knowledge", "archie support limits"],
    keywords: ["archie", "documentation", "does not know", "product support"],
    route: "/user-guide",
    source: { kind: "policy", label: "Archie Product Support Policy" },
  },
  {
    id: "faq-archie-draft-approval",
    category: "archie",
    question: "Can Archie change my schedule automatically?",
    answer:
      "No. Archie can prepare a reviewable draft for task order or schedule changes, but it does not apply those changes without your approval.",
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
