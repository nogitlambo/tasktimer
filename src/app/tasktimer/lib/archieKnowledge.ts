import type { ArchieKnowledgeCitation, ArchieSettingsPane } from "./archieAssistant";

type ArchieRoute = "/tasklaunch" | "/dashboard" | "/settings" | "/history-manager" | "/user-guide" | "/feedback" | "/leaderboard";

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
      "TaskLaunch is the authenticated TaskTimer workspace for tasks, schedules, focused sessions, dashboard review, history management, friends, leaderboard progress, feedback, and settings.",
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
      "Use the desktop rail or mobile navigation to move between Dashboard, Tasks, Friends, Leaderboard, and Settings. Settings, History Manager, User Guide, and Feedback also open as dedicated routes.",
    aliases: ["where is dashboard", "where is tasks", "how do i open settings", "how do i navigate the app"],
    keywords: ["footer", "navigation", "desktop rail", "dashboard", "tasks", "friends", "leaderboard", "settings route"],
    route: "/user-guide",
    source: { kind: "user-guide", label: "User Guide > Modules" },
    suggestedAction: { kind: "navigate", label: "Open User Guide", href: "/user-guide" },
  },
  {
    id: "faq-tasks-create-first-task",
    category: "tasks",
    question: "How do I create and start my first task?",
    answer:
      "Use Add Task, choose Recurring or Once-off, set a time goal or skip it, choose a planned start, and optionally add Time Checkpoints. Then press Start to begin timing.",
    aliases: ["how do i add a task", "how do i start timing", "how do i start a timer"],
    keywords: ["add task", "recurring", "once-off", "time goal", "planned start", "start", "stop", "resume"],
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
      "Each task row or card includes Start or Stop, Reset, Edit, History, Focus, and more task controls. Duplicate, Collapse, Delete, and export actions are available where supported.",
    aliases: ["what can i do with a task", "where is edit task", "where is duplicate task", "where is delete task"],
    keywords: ["task row", "edit", "duplicate", "delete", "collapse", "history"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Tasks" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-tasks-ordering",
    category: "tasks",
    question: "How can I order my tasks?",
    answer:
      "Use the task ordering menu on Tasks. It supports A-Z, Schedule/Time, and Custom, where Custom preserves your manual order.",
    aliases: ["sort tasks", "task order menu", "custom task order", "schedule time order"],
    keywords: ["tasks", "order", "A-Z", "Schedule/Time", "Custom", "task ordering menu"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Tasks" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-schedule-planner",
    category: "schedule",
    question: "How does the Schedule planner work?",
    answer:
      "Open Schedule from the Tasks header. The weekly planner shows scheduled tasks, while Unscheduled Tasks in the Quick Place tray can be dragged onto the planner to assign a day and start time.",
    aliases: ["weekly planner", "unscheduled tasks tray", "quick place", "schedule tasks"],
    keywords: ["schedule", "weekly planner", "Quick Place", "Unscheduled Tasks", "drag", "planned start"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Schedule" },
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
      "Time Checkpoints are optional milestone markers. They must be greater than zero and below the task time goal, and they can trigger Sound Alert or Toast Alert behavior.",
    aliases: ["how do i set checkpoints", "how do milestones work", "checkpoint unit", "checkpoint alerts"],
    keywords: ["checkpoints", "milestones", "Time Checkpoints", "Sound Alert", "Toast Alert", "time goal"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Timers and Checkpoints" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-timers-preset-intervals",
    category: "timers",
    question: "What are preset checkpoint intervals?",
    answer:
      "Use Preset Intervals auto-fills checkpoint times using a fixed increment each time you add a checkpoint. Preset checkpoint intervals are treated as a Pro feature in the Add Task flow.",
    aliases: ["preset intervals", "auto fill checkpoints", "checkpoint intervals"],
    keywords: ["Use Preset Intervals", "preset interval", "checkpoint", "Pro feature", "Add Task"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Checkpoints" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-time-goals-completion",
    category: "tasks",
    question: "What happens when I complete a time goal?",
    answer:
      "When a time goal is completed, TaskLaunch can ask for a challenge rating and notes so the session has richer history for Focus Mode insights and Archie recommendations.",
    aliases: ["time goal complete", "challenge rating", "task complete note", "session note"],
    keywords: ["time goal", "Task Complete", "challenge level", "notes", "completion difficulty"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Time Goals" },
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
      "History Manager is the dedicated review screen for recorded task logs. It groups entries by task and date, lets you sort by DATE/TIME or ELAPSED, and supports Bulk Edit selection before Delete confirmation.",
    aliases: ["what can i do in history manager", "history manager sorting", "bulk delete history"],
    keywords: ["history manager", "group by task", "group by date", "DATE/TIME", "ELAPSED", "Bulk Edit", "Delete"],
    route: "/history-manager",
    source: { kind: "user-guide", label: "User Guide > History Manager" },
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
    source: { kind: "user-guide", label: "User Guide > History Manager" },
    suggestedAction: { kind: "navigate", label: "Open History Manager", href: "/history-manager" },
  },
  {
    id: "faq-focus-mode-open",
    category: "focus",
    question: "How do I open Focus Mode?",
    answer:
      "Open Focus Mode by selecting a task name, or enable Auto switch to Focus Mode on launch in Settings > Preferences. The Focus dial starts or stops the selected task.",
    aliases: ["how do i open focus mode", "what is focus mode", "task focus view"],
    keywords: ["focus mode", "task name", "dial", "Auto switch to Focus Mode on launch", "Preferences"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Focus Mode" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-focus-insights",
    category: "focus",
    question: "Where do Focus Mode insights come from?",
    answer:
      "Focus Mode Quick Stats come from task history, notes, challenge ratings, and productivity settings. They include Highest logged time, top weekday, trend deltas, recent challenge level, and productivity-period status.",
    aliases: ["focus insights source", "best session in focus mode", "focus trend deltas"],
    keywords: ["Quick Stats", "task history", "Highest logged time", "Top productivity weekday", "Recent challenge level", "productivity period"],
    route: "/tasklaunch",
    source: { kind: "user-guide", label: "User Guide > Focus Mode" },
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "faq-dashboard-panels",
    category: "dashboard",
    question: "What is on the Dashboard?",
    answer:
      "Dashboard includes XP Progress, Today, This Week, Completed, Momentum, Avg Session by Task, Timeline, and Focus Heatmap panels.",
    aliases: ["dashboard panels", "what does dashboard show", "dashboard summary"],
    keywords: ["Dashboard", "XP Progress", "Today", "This Week", "Completed", "Momentum", "Avg Session by Task", "Timeline", "Focus Heatmap"],
    route: "/dashboard",
    source: { kind: "user-guide", label: "User Guide > Dashboard" },
    suggestedAction: { kind: "navigate", label: "Open Dashboard", href: "/dashboard" },
  },
  {
    id: "faq-dashboard-customize",
    category: "dashboard",
    question: "How do I customize dashboard panels?",
    answer:
      "Use Customize dashboard panels or Edit Dashboard Layout on Dashboard. Choose visible panels, then use Done to keep changes or Cancel to leave edit mode.",
    aliases: ["customize dashboard", "edit dashboard layout", "hide dashboard panel"],
    keywords: ["Customize dashboard panels", "Edit Dashboard Layout", "Done", "Cancel", "dashboard panels"],
    route: "/dashboard",
    source: { kind: "user-guide", label: "User Guide > Dashboard" },
    suggestedAction: { kind: "navigate", label: "Open Dashboard", href: "/dashboard" },
  },
  {
    id: "faq-settings-what-is",
    category: "settings",
    question: "What can I configure in Settings?",
    answer:
      "Settings includes Account, Preferences, Appearance, Notifications, Help Center, Data, and About. Desktop opens Account by default, while mobile starts from the module list unless a pane is requested.",
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
      "Open Settings, then Preferences. Preferences includes Auto switch to Focus Mode on launch, Load Module on App Startup, Task View, Week Starts On, Optimal Productivity Period, and Load Defaults.",
    aliases: ["task settings defaults", "task view setting", "week starts on", "auto focus on launch"],
    keywords: ["Preferences", "Auto switch to Focus Mode on launch", "Load Module on App Startup", "Task View", "Week Starts On", "Optimal Productivity Period", "Load Defaults"],
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
      "Account shows plan status, current rank, username, email address, UID, member since date, sync status, avatar choices, rank ladder access, Sign Out, and Delete Account confirmation.",
    aliases: ["account settings", "profile card", "copy uid", "delete account"],
    keywords: ["Account", "Free User", "Pro User", "Current Rank", "Username", "UID", "Member Since", "Delete Account", "Sign Out"],
    route: "/settings",
    settingsPane: "general",
    source: { kind: "user-guide", label: "User Guide > Account" },
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
    source: { kind: "user-guide", label: "User Guide > Account" },
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
    source: { kind: "user-guide", label: "User Guide > Backup and Reset" },
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
    source: { kind: "user-guide", label: "User Guide > Backup and Reset" },
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
    question: "Where are About, Feedback, and User Guide?",
    answer:
      "Open Settings, then Help Center for User Guide, Privacy Policy, and Feedback. About is its own Settings module with the product summary.",
    aliases: ["where is about", "where is user guide", "where is feedback", "support links"],
    keywords: ["Help Center", "User Guide", "Privacy Policy", "Feedback", "About", "settings support"],
    route: "/settings",
    source: { kind: "user-guide", label: "User Guide > Settings" },
    suggestedAction: { kind: "navigate", label: "Open Settings", href: "/settings" },
  },
  {
    id: "faq-friends-sharing",
    category: "friends",
    question: "How do Friends and shared tasks work?",
    answer:
      "Friends shows your friends list, tasks shared by you, incoming requests, and outgoing requests. Use Add Friend by email, then Share Task with all friends or selected friends.",
    aliases: ["add friend", "share task", "incoming requests", "outgoing requests"],
    keywords: ["Friends", "Add Friend", "Share Task", "Incoming Requests", "Outgoing Requests", "shared tasks"],
    route: "/user-guide",
    source: { kind: "user-guide", label: "User Guide > Friends" },
    suggestedAction: { kind: "navigate", label: "Open User Guide", href: "/user-guide" },
  },
  {
    id: "faq-friends-profile",
    category: "friends",
    question: "What is in a Friend Profile?",
    answer:
      "Friend Profile shows friend identity, member since information, rank, and a Delete Friend action.",
    aliases: ["friend info", "delete friend", "friend rank"],
    keywords: ["Friend Profile", "Friend Info", "Delete Friend", "Rank", "Member since"],
    route: "/user-guide",
    source: { kind: "user-guide", label: "User Guide > Friends" },
    suggestedAction: { kind: "navigate", label: "Open User Guide", href: "/user-guide" },
  },
  {
    id: "faq-leaderboard-ranks",
    category: "leaderboard",
    question: "How does the Leaderboard work?",
    answer:
      "Leaderboard compares public focus progress with Top focus performers, Your position, Rising this week, and Closest rivals. Rows include focus time, streak, XP, weekly XP, and rank insignia.",
    aliases: ["global ladder", "top focus performers", "closest rivals", "rising this week"],
    keywords: ["Leaderboard", "Top focus performers", "Your position", "Rising this week", "Closest rivals", "XP", "rank insignia"],
    route: "/leaderboard",
    source: { kind: "user-guide", label: "User Guide > Leaderboard" },
    suggestedAction: { kind: "navigate", label: "Open Leaderboard", href: "/leaderboard" },
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
    source: { kind: "user-guide", label: "User Guide > Feedback" },
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
    source: { kind: "user-guide", label: "User Guide > Troubleshooting" },
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
    source: { kind: "user-guide", label: "User Guide > Troubleshooting" },
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
    route: "/user-guide",
    source: { kind: "policy", label: "Archie Product Support Policy" },
  },
  {
    id: "faq-archie-pro-features",
    category: "archie",
    question: "Which Archie features require Pro?",
    answer:
      "Free users can ask product questions. Workflow recommendations, reviewable draft changes, and AI-refined responses are Pro features when the API requires an upgrade.",
    aliases: ["archie pro required", "archie upgrade", "archie recommendations"],
    keywords: ["Archie", "Free", "Pro", "workflow recommendations", "reviewable draft changes", "AI-refined responses"],
    route: "/user-guide",
    source: { kind: "user-guide", label: "User Guide > Archie" },
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
