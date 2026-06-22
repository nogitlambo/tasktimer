export type UserGuideHowTo = {
  title: string;
  steps: string[];
};

export type UserGuideModule = {
  id: string;
  title: string;
  category: string;
  summary: string;
  routeHref: string;
  screenshot: string;
  screenshotAlt: string;
  details: string[];
  howTos: UserGuideHowTo[];
  tips: string[];
};

export const REQUIRED_USER_GUIDE_MODULE_IDS = [
  "navigation",
  "tasks",
  "schedule",
  "dashboard",
  "history-manager",
  "friends",
  "leaderboards",
  "account-profile",
  "settings",
  "feedback",
] as const;

export const USER_GUIDE_MODULES: UserGuideModule[] = [
  {
    id: "navigation",
    title: "Navigation",
    category: "Getting Around",
    summary: "Move between the main TaskLaunch modules from the desktop rail, mobile footer, and profile menus.",
    routeHref: "/dashboard",
    screenshot: "/user-guide/mobile-menu.webp",
    screenshotAlt: "Sanitized TaskLaunch navigation screenshot showing module links and the profile menu.",
    details: [
      "The desktop rail holds the main modules: Dashboard, Tasks, Friends, and Leaderboards.",
      "The profile summary card opens secondary actions such as Settings, User Guide, and Sign Out.",
      "On smaller screens, the footer keeps core modules reachable while the hamburger menu holds account-level actions.",
    ],
    howTos: [
      {
        title: "Open the User Guide from the app",
        steps: [
          "On desktop, select the profile summary card at the bottom of the rail.",
          "Choose User Guide from the profile menu.",
          "On mobile, open the hamburger menu in the top bar and choose User Guide.",
        ],
      },
      {
        title: "Return to core modules",
        steps: [
          "Use Dashboard for progress and summaries.",
          "Use Tasks for active timers and task setup.",
          "Use Friends and Leaderboards for social progress views.",
        ],
      },
    ],
    tips: [
      "If you are unsure where to start, open Dashboard first and use its summaries to choose the next task.",
      "The profile menu is reserved for account, help, and sign-out actions rather than daily workflow tools.",
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    category: "Core Workflow",
    summary: "Create tasks, start focused work sessions, set goals, add notes, and review per-task history.",
    routeHref: "/tasklaunch",
    screenshot: "/user-guide/tasks.webp",
    screenshotAlt: "Sanitized TaskLaunch Tasks screenshot showing task cards, timers, and task actions.",
    details: [
      "Tasks are the main work items in TaskLaunch. Each task can track elapsed time, completion progress, milestones, and history.",
      "Task cards expose quick actions for start, stop, edit, reset, history, manual entry, sharing, and export where supported.",
      "Focus sessions can carry notes, checkpoint alerts, and time-goal completion flows into your history.",
    ],
    howTos: [
      {
        title: "Create and run a task",
        steps: [
          "Open Tasks.",
          "Use Add Task and enter a clear task name.",
          "Start the task when you begin working.",
          "Stop the task when the session ends so elapsed time and XP can be recorded.",
        ],
      },
      {
        title: "Review task-specific history",
        steps: [
          "Open the task action menu.",
          "Choose History to expand inline history.",
          "Select View Summary for a session summary or pin the chart if you want it to reopen later.",
        ],
      },
    ],
    tips: [
      "Short, concrete task names make dashboard and history summaries easier to scan.",
      "Use manual entries when you forgot to start a timer but still want an accurate history.",
    ],
  },
  {
    id: "schedule",
    title: "Schedule",
    category: "Planning",
    summary: "Plan tasks across the week using scheduled placement, optimal productivity days, and drag previews.",
    routeHref: "/tasklaunch?page=schedule",
    screenshot: "/user-guide/schedule.webp",
    screenshotAlt: "Sanitized TaskLaunch Schedule screenshot showing a weekly task planning board.",
    details: [
      "Schedule gives Tasks a calendar-style planning view without replacing the single task list.",
      "Tasks can be arranged by day and time, with visual placement previews while moving scheduled items.",
      "Settings can highlight optimal productivity days so recurring planning fits your preferred work rhythm.",
    ],
    howTos: [
      {
        title: "Place a task on the schedule",
        steps: [
          "Open Tasks and switch to Schedule.",
          "Choose the task you want to place.",
          "Move it to the intended day and time block.",
          "Check the preview for overlaps before committing the placement.",
        ],
      },
    ],
    tips: [
      "Use Schedule for intention, not punishment. Move work when your day changes.",
      "Set optimal productivity days in Settings when you want scheduled work to prefer your strongest days.",
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    category: "Insights",
    summary: "Read today, weekly progress, momentum, activity heatmaps, task completion, and productivity summaries.",
    routeHref: "/dashboard",
    screenshot: "/user-guide/dashboard.webp",
    screenshotAlt: "Sanitized TaskLaunch Dashboard screenshot showing progress cards and activity summaries.",
    details: [
      "Dashboard turns task history into progress indicators, charts, and summaries.",
      "Cards emphasize today, weekly progress, momentum, task completion, and activity overview.",
      "Dashboard modules are designed for scanning, comparison, and deciding what to do next.",
    ],
    howTos: [
      {
        title: "Use Dashboard to choose your next task",
        steps: [
          "Open Dashboard.",
          "Review today and weekly progress.",
          "Check the task completion and activity cards for gaps.",
          "Return to Tasks and choose the next useful session.",
        ],
      },
    ],
    tips: [
      "Dashboard is most useful after a few logged sessions because charts need history to summarize.",
      "Treat low activity as context, not failure; the app is built around recovery and restarting.",
    ],
  },
  {
    id: "history-manager",
    title: "History Manager",
    category: "History",
    summary: "Review, sort, summarize, manually add, bulk-select, and delete historical task sessions.",
    routeHref: "/history-manager",
    screenshot: "/user-guide/history-manager.webp",
    screenshotAlt: "Sanitized TaskLaunch History Manager screenshot showing dated history rows and bulk controls.",
    details: [
      "History Manager is the full-screen workspace for task history maintenance.",
      "Rows can be grouped by task and date, sorted by Date/Time or Elapsed, selected hierarchically, and bulk deleted.",
      "History summaries and notes help explain what happened during specific work sessions.",
    ],
    howTos: [
      {
        title: "Add a manual history entry",
        steps: [
          "Open History Manager.",
          "Find the task that should receive the missing time.",
          "Choose manual entry for that task.",
          "Set Date/Time, Elapsed, and optional notes, then save.",
        ],
      },
      {
        title: "Bulk edit history safely",
        steps: [
          "Choose Select.",
          "Select a task, date group, or individual rows.",
          "Review the selected count and delete summary.",
          "Confirm only when the selected rows are exactly what you intend to remove.",
        ],
      },
    ],
    tips: [
      "Sort Date/Time and Elapsed columns when auditing unusual history entries.",
      "Use summaries before deleting entries if you need to understand what the session represents.",
    ],
  },
  {
    id: "friends",
    title: "Friends",
    category: "Social",
    summary: "Manage friend requests, view friend profiles, and share selected task summaries.",
    routeHref: "/friends",
    screenshot: "/user-guide/friends.webp",
    screenshotAlt: "Sanitized TaskLaunch Friends screenshot showing friend cards and request actions.",
    details: [
      "Friends adds optional social accountability without changing your private task list by default.",
      "Friend profiles can show display identity, rank context, and shared task summaries where sharing is enabled.",
      "Friend request alerts appear in navigation badges when there is pending activity.",
    ],
    howTos: [
      {
        title: "Send and manage friend requests",
        steps: [
          "Open Friends.",
          "Search or enter the username for the person you want to add.",
          "Send a request and wait for acceptance.",
          "Use the Friends screen to review incoming requests and current friends.",
        ],
      },
    ],
    tips: [
      "Share only the task summaries you actually want another person to see.",
      "Use Friends for accountability when it helps, and keep the workflow solo when it does not.",
    ],
  },
  {
    id: "leaderboards",
    title: "Leaderboards and XP",
    category: "Progress",
    summary: "Understand XP, ranks, badges, weekly standings, global standings, and rival leaderboards.",
    routeHref: "/leaderboards",
    screenshot: "/user-guide/leaderboards.webp",
    screenshotAlt: "Sanitized TaskLaunch Leaderboards screenshot showing XP rankings and rank badges.",
    details: [
      "XP is awarded from recorded task effort and supports rank progression.",
      "Leaderboards include global, weekly, and rival views so progress can be compared at different scopes.",
      "Rank badges and promotions are visual feedback, while the underlying value comes from logged effort.",
    ],
    howTos: [
      {
        title: "Check rank progress",
        steps: [
          "Open Leaderboards or select the XP/rank header.",
          "Review current XP, rank, and progress toward the next rank.",
          "Use weekly and rival tabs to compare short-term progress.",
        ],
      },
    ],
    tips: [
      "Weekly views are better for fresh motivation; global views are long-term context.",
      "Rank progress follows logged effort, so accurate task history matters.",
    ],
  },
  {
    id: "account-profile",
    title: "Account and Profile",
    category: "Account",
    summary: "Manage username, avatar, rank badge, plan status, sign-out, and account deletion.",
    routeHref: "/account",
    screenshot: "/user-guide/account-profile.webp",
    screenshotAlt: "Sanitized TaskLaunch Account screenshot showing profile identity, XP, rank, and account actions.",
    details: [
      "Account shows the signed-in identity, username, email, member date, XP, rank, and selected badge.",
      "Avatar and rank controls affect how your profile appears in supported app surfaces.",
      "Sign out and account deletion live here because they affect the whole signed-in workspace.",
    ],
    howTos: [
      {
        title: "Update profile identity",
        steps: [
          "Open Account from the profile menu or mobile top bar avatar.",
          "Choose the avatar or username control you want to change.",
          "Save the change and wait for the profile sync notice.",
        ],
      },
    ],
    tips: [
      "Use a recognizable username if you plan to use Friends or Leaderboards.",
      "Delete Account is permanent; export or review data first if you need a record.",
    ],
  },
  {
    id: "settings",
    title: "Settings",
    category: "Configuration",
    summary: "Configure preferences, appearance, sounds, alerts, notifications, privacy links, data tools, and reset options.",
    routeHref: "/settings",
    screenshot: "/user-guide/settings.webp",
    screenshotAlt: "Sanitized TaskLaunch Settings screenshot showing settings modules and preferences.",
    details: [
      "Settings is split into modules such as Preferences, Appearance, Sounds & Alerts, Notifications, Data, and About.",
      "Desktop layouts show the settings list and detail pane together; mobile layouts open details after selecting a module.",
      "Data tools include backup, import/export, History Manager access, and local reset actions.",
    ],
    howTos: [
      {
        title: "Change productivity preferences",
        steps: [
          "Open Settings.",
          "Choose Preferences.",
          "Adjust task behavior, dashboard options, or optimal productivity days.",
          "Return to the relevant module and confirm the behavior matches your workflow.",
        ],
      },
      {
        title: "Manage data",
        steps: [
          "Open Settings.",
          "Choose Data.",
          "Use History Manager, export/import, or reset tools according to the maintenance task you need.",
        ],
      },
    ],
    tips: [
      "Settings choices are meant to reduce friction; revisit them when your workflow changes.",
      "Use Reset All Data only when you intentionally want to remove local app data from the device.",
    ],
  },
  {
    id: "feedback",
    title: "Feedback",
    category: "Support",
    summary: "Send bug reports, feature ideas, general feedback, and optional PNG screenshot attachments.",
    routeHref: "/feedback",
    screenshot: "/user-guide/feedback.webp",
    screenshotAlt: "Sanitized TaskLaunch Feedback screenshot showing feedback form fields and submission controls.",
    details: [
      "Feedback helps report bugs, request enhancements, and explain workflow issues.",
      "You can submit with an email address or choose anonymous logging where supported.",
      "Pasted screenshots are processed as PNG attachments so visual issues can be understood more quickly.",
    ],
    howTos: [
      {
        title: "Submit useful feedback",
        steps: [
          "Open Feedback.",
          "Choose bug, feature, or general feedback.",
          "Add a short title and detailed reproduction steps or context.",
          "Paste screenshots into the details field when they clarify the issue.",
          "Submit after the form validation message is clear.",
        ],
      },
    ],
    tips: [
      "For bugs, include what you expected, what happened, and how to reproduce it.",
      "For feature requests, describe the workflow problem rather than only the desired button or screen.",
    ],
  },
];

function normalizeSearch(value: string) {
  return String(value || "").trim().toLocaleLowerCase();
}

function moduleSearchText(module: UserGuideModule) {
  return [
    module.title,
    module.category,
    module.summary,
    module.routeHref,
    ...module.details,
    ...module.tips,
    ...module.howTos.flatMap((howTo) => [howTo.title, ...howTo.steps]),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

export function filterUserGuideModules(
  modules: readonly UserGuideModule[],
  query: string,
  category = "all"
) {
  const normalizedQuery = normalizeSearch(query);
  const normalizedCategory = normalizeSearch(category);

  return modules.filter((module) => {
    const categoryMatches = !normalizedCategory || normalizedCategory === "all" || normalizeSearch(module.category) === normalizedCategory;
    if (!categoryMatches) return false;
    if (!normalizedQuery) return true;
    return moduleSearchText(module).includes(normalizedQuery);
  });
}
