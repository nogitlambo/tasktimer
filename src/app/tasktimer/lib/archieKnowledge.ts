import type { ArchieKnowledgeCitation } from "./archieAssistant";

export type ArchieKnowledgeEntry = {
  id: string;
  title: string;
  section: string;
  keywords: string[];
  content: string;
  suggestedAction?:
    | { kind: "navigate"; label: string; href: string }
    | { kind: "openSettingsPane"; label: string; pane: "general" | "preferences" | "appearance" | "notifications" | "privacy" | "userGuide" | "about" | "feedback" | "data" | "reset" };
};

export const ARCHIE_KNOWLEDGE_BASE: ArchieKnowledgeEntry[] = [
  {
    id: "guide-overview",
    title: "User Guide",
    section: "Overview",
    keywords: ["overview", "app", "what is tasklaunch", "what is timebase", "what does this app do"],
    content:
      "TaskLaunch is a multi-task time tracking app for focused work. The core flows are task tracking, reviewing history, configuring preferences and appearance, and managing backups.",
    suggestedAction: { kind: "navigate", label: "Open User Guide", href: "/user-guide" },
  },
  {
    id: "guide-modules",
    title: "User Guide",
    section: "Modules",
    keywords: ["modules", "navigation", "where is", "footer", "settings", "dashboard", "tasks"],
    content:
      "Use the footer bar to move between Dashboard, Tasks, and other pages. Settings opens its own route. Task controls are intended for task tracking context and are hidden on non-task pages.",
    suggestedAction: { kind: "navigate", label: "Open Settings", href: "/settings" },
  },
  {
    id: "guide-tasks",
    title: "User Guide",
    section: "Tasks",
    keywords: ["task", "tasks", "edit task", "duplicate", "delete", "collapse", "manual edit"],
    content:
      "Each task row provides Start or Stop, Reset, Edit, History, and a more-actions menu. Manual edits update the timer value but do not create history until a reset is logged.",
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "guide-timers",
    title: "User Guide",
    section: "Timers and Checkpoints",
    keywords: ["timer", "timers", "checkpoint", "milestone", "milestones", "progress bar"],
    content:
      "Timers accumulate while running. Milestones can be configured per task with day, hour, or minute units. Progress visuals and checkpoint states update as elapsed time advances.",
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "guide-history",
    title: "User Guide",
    section: "History",
    keywords: ["history", "inline history", "analyse", "pin", "manage history"],
    content:
      "Inline History opens from each task and shows recent session entries as bars. Pin keeps a history panel open. Analyse and Manage actions are available from the inline panel footer.",
    suggestedAction: { kind: "navigate", label: "Open History Manager", href: "/history-manager" },
  },
  {
    id: "guide-history-manager",
    title: "User Guide",
    section: "History Manager",
    keywords: ["history manager", "bulk delete", "sorting", "edit mode", "selection"],
    content:
      "History Manager groups entries by task and date, supports sorting by date, time, or duration, and supports hierarchical bulk selection for deletion.",
    suggestedAction: { kind: "navigate", label: "Open History Manager", href: "/history-manager" },
  },
  {
    id: "guide-focus",
    title: "User Guide",
    section: "Focus Mode",
    keywords: ["focus", "focus mode", "session note", "quick stats", "insights"],
    content:
      "Focus Mode gives a single-task view with a circular dial, elapsed time, checkpoint ring markers, and quick stats derived from task history. Session notes can be saved for the current task.",
    suggestedAction: { kind: "navigate", label: "Open Tasks", href: "/tasklaunch" },
  },
  {
    id: "guide-settings",
    title: "User Guide",
    section: "Settings",
    keywords: ["settings", "preferences", "appearance", "notifications", "data tools", "support"],
    content:
      "Settings is the central control panel for app-wide behavior including appearance, task defaults, history manager access, backups, feedback, and support links.",
    suggestedAction: { kind: "navigate", label: "Open Settings", href: "/settings" },
  },
  {
    id: "about-summary",
    title: "About",
    section: "Feature Overview",
    keywords: ["about", "feature overview", "dashboard insights", "account syncing"],
    content:
      "TaskLaunch combines task timing, dashboard insights, account syncing, and history management across the app routes. Use the User Guide for walkthroughs and Data tools for export, import, and reset workflows.",
    suggestedAction: { kind: "openSettingsPane", label: "Open About", pane: "about" },
  },
  {
    id: "settings-appearance",
    title: "Settings",
    section: "Appearance",
    keywords: ["appearance", "theme", "dynamic colors", "menu style"],
    content:
      "Appearance settings control the app theme, menu and button style, and whether progress visuals use dynamic colors.",
    suggestedAction: { kind: "openSettingsPane", label: "Open Appearance", pane: "appearance" },
  },
  {
    id: "settings-data",
    title: "Settings",
    section: "Data",
    keywords: ["backup", "export", "import", "reset", "data"],
    content:
      "Data tools let you open History Manager, export a JSON backup, import a backup, or reset local data. Export before cleanup or reset operations.",
    suggestedAction: { kind: "openSettingsPane", label: "Open Data", pane: "data" },
  },
];

function tokenize(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function searchArchieKnowledge(query: string): ArchieKnowledgeEntry[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  return [...ARCHIE_KNOWLEDGE_BASE]
    .map((entry) => {
      const corpus = `${entry.title} ${entry.section} ${entry.content} ${entry.keywords.join(" ")}`.toLowerCase();
      const score =
        tokens.reduce((sum, token) => {
          if (corpus.includes(token)) return sum + 1;
          return sum;
        }, 0) +
        entry.keywords.reduce((sum, keyword) => {
          if (!query.toLowerCase().includes(keyword)) return sum;
          return sum + Math.max(2, keyword.split(/\s+/).length * 3);
        }, 0) +
        (query.toLowerCase().includes(entry.section.toLowerCase()) ? 4 : 0);
      return { entry, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.entry);
}

export function toCitation(entry: ArchieKnowledgeEntry): ArchieKnowledgeCitation {
  return {
    id: entry.id,
    title: entry.title,
    section: entry.section,
  };
}
