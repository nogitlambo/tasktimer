"use client";

"use client";

import { useEffect, useMemo, useState } from "react";
import { initTaskTimerClient } from "../tasktimerClient";
import "../tasktimer.css";

type GuideSection = {
  id: string;
  title: string;
  icon: string;
  paragraphs: string[];
  shots: Array<{ label: string; image?: string }>;
};

export default function UserGuidePage() {
  const taskTimerRootPath = () => {
    const pathname = window.location.pathname || "";
    const normalized = pathname.replace(/\/+$/, "");
    const taskTimerMatch = normalized.match(/^(.*?)(\/tasktimer)(?:\/|$)/);
    if (taskTimerMatch) return `${taskTimerMatch[1] || ""}/tasktimer`;
    const pageStyleRoot = normalized.replace(/\/(settings|history-manager|user-guide)$/, "");
    return pageStyleRoot || normalized || "/tasktimer";
  };

  const appRoute = (path: string) => {
    if (!path.startsWith("/tasktimer")) return path;
    const hashIndex = path.indexOf("#");
    const queryIndex = path.indexOf("?");
    const cutIndex =
      queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
    const rawPath = cutIndex >= 0 ? path.slice(0, cutIndex) : path;
    const trailing = cutIndex >= 0 ? path.slice(cutIndex) : "";
    const normalizedPath = rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
    const suffix = normalizedPath.replace(/^\/tasktimer/, "");
    return `${taskTimerRootPath()}${suffix}${trailing}`;
  };

  useEffect(() => {
    const { destroy } = initTaskTimerClient();
    return () => destroy();
  }, []);

  const sections = useMemo<GuideSection[]>(
    () => [
      {
        id: "ug-overview",
        title: "Overview",
        icon: "/icon-dashboard.png",
        paragraphs: [
          "TaskTimer is a multi-task time tracking app designed for focused work sessions. You can run timers per task, define milestone checkpoints, review session history, and monitor consistency over time.",
          "The app is organized around four core flows: tracking active tasks, reviewing history, configuring categories and appearance, and managing backups. Most actions happen on the Tasks page, with Settings used for global controls.",
          "All key interactions are optimized for mobile and desktop: tap/click buttons for actions, swipe history charts to page entries, and use dedicated manager screens for bulk history operations.",
        ],
        shots: [
          { label: "Screenshot placeholder: App Overview" },
          { label: "Screenshot placeholder: Main Navigation Areas" },
        ],
      },
      {
        id: "ug-quick-start",
        title: "Quick Start",
        icon: "/icon-tasks.png",
        paragraphs: [
          "Create your first task with Add Task, then press Start to begin timing. Use Stop to pause and Start again to resume. Press Reset when you want to clear the timer and optionally log the finished session to history.",
          "If you track different activity types, switch modes to keep tasks grouped by category. Mode 1 is always available; Mode 2 and Mode 3 can be enabled and renamed in Configure Modes.",
          "Open Settings from the footer when you need advanced configuration, appearance controls, exports/imports, or full history management.",
        ],
        shots: [
          { label: "Screenshot placeholder: Create First Task" },
          { label: "Screenshot placeholder: Start/Stop/Reset Flow" },
          { label: "Screenshot placeholder: First Logged Session" },
        ],
      },
      {
        id: "ug-nav",
        title: "Navigation",
        icon: "/icon-dashboard.png",
        paragraphs: [
          "Use the footer bar to move between Dashboard, Tasks, and additional pages. The Settings button opens the dedicated settings route.",
          "The top bar contains mode switching and Add Task controls. Mode and Add Task are intended for task tracking context and are hidden on non-task pages.",
          "Inside Settings, menu items open overlays for About, Appearance, Task Settings, and Category Manager. History Manager opens as its own route for larger data operations.",
        ],
        shots: [
          { label: "Navigation Footer (Example)", image: "/navigation.PNG" },
          { label: "Screenshot placeholder: Top Bar and Mode Switch" },
          { label: "Screenshot placeholder: Settings Route Entry" },
        ],
      },
      {
        id: "ug-tasks",
        title: "Tasks",
        icon: "/icon-tasks.png",
        paragraphs: [
          "Each task row provides Start/Stop, Reset, Edit, History, and a more-actions menu. Use Duplicate to clone setup quickly, Collapse to hide progress details, and Delete to remove a task.",
          "Task names can be edited directly by opening Edit, where you can also adjust accumulated time manually. Manual edits change the task timer value but do not create history until a reset is logged.",
          "Task state is persisted locally, including elapsed time, milestones, and mode assignment. This allows continuity between sessions on the same device.",
        ],
        shots: [
          { label: "Screenshot placeholder: Task List View" },
          { label: "Screenshot placeholder: Task Action Buttons" },
          { label: "Screenshot placeholder: Task More Menu" },
        ],
      },
      {
        id: "ug-timers",
        title: "Timers and Checkpoints",
        icon: "/icon-tasks.png",
        paragraphs: [
          "Timers accumulate elapsed time while running. Start begins timing, Stop pauses timing, and Reset returns elapsed time to zero.",
          "Milestones (checkpoints) can be enabled per task in Edit. You can choose Day, Hour, or Minute as the unit and assign optional descriptions to each checkpoint.",
          "As elapsed time advances, progress bar color can update dynamically and checkpoint visuals change state when reached. Checkpoint labels and indicators reflect pending versus achieved status.",
        ],
        shots: [
          { label: "Screenshot placeholder: Running Timer" },
          { label: "Screenshot placeholder: Progress Bar with Checkpoints" },
          { label: "Screenshot placeholder: Reached Checkpoint State" },
        ],
      },
      {
        id: "ug-history",
        title: "History",
        icon: "/icon-dashboard.png",
        paragraphs: [
          "Inline History opens from each task and shows recent session entries as bars. You can toggle between 7-day and 14-day ranges, page through entries, and inspect values directly on the chart.",
          "Pin keeps a task history panel open for quick reference. Export, Analyse, and Manage actions are available from the inline panel footer.",
          "History entry colors follow the same color logic as progress bars when dynamic colors are enabled. If dynamic colors are disabled in Task Settings, static mode color is used.",
        ],
        shots: [
          { label: "Screenshot placeholder: Inline History (7 Entries)" },
          { label: "Screenshot placeholder: Inline History (14 Entries)" },
          { label: "Screenshot placeholder: Pinned History Panel" },
        ],
      },
      {
        id: "ug-history-manager",
        title: "History Manager",
        icon: "/icon-dashboard.png",
        paragraphs: [
          "History Manager is the comprehensive view for all recorded entries. It groups entries by task and date, supports sorting by date/time or elapsed duration, and shows task metadata.",
          "Bulk Edit mode enables hierarchical selection: task-level, date-level, and row-level checkboxes. Selected rows can be deleted in one action with a confirmation summary.",
          "Single-row delete is also available. After deletion, summaries and counts are recalculated to keep totals accurate.",
        ],
        shots: [
          { label: "Screenshot placeholder: History Manager Overview" },
          { label: "Screenshot placeholder: Bulk Edit Selection" },
          { label: "Screenshot placeholder: Delete Confirmation Summary" },
        ],
      },
      {
        id: "ug-focus",
        title: "Focus Mode",
        icon: "/icon-settings.png",
        paragraphs: [
          "Tap a task name to open Focus Mode. This view provides a large circular dial, formatted elapsed time, checkpoint ring markers, and focused controls for starting/stopping the selected task.",
          "Focus insights summarize key performance metrics such as best session and trend deltas. These values are derived from your task history.",
          "Checkpoint display can be toggled in Focus Mode when a task has milestones configured.",
        ],
        shots: [
          { label: "Screenshot placeholder: Focus Dial" },
          { label: "Screenshot placeholder: Focus Checkpoint Ring" },
          { label: "Screenshot placeholder: Focus Insights Panel" },
        ],
      },
      {
        id: "ug-modes",
        title: "Modes",
        icon: "/icon-account.png",
        paragraphs: [
          "Modes are category buckets used to organize tasks. Mode 1 is mandatory and always enabled. Mode 2 and Mode 3 can be enabled or disabled from Configure Modes.",
          "Each mode supports a custom label and color. These colors can drive task visuals and static history/progress appearance when dynamic colors are turned off.",
          "Deleting a mode category removes all tasks under that mode after confirmation. Use this carefully because it affects task organization and related history context.",
        ],
        shots: [
          { label: "Screenshot placeholder: Mode Switch (Top Bar)" },
          { label: "Screenshot placeholder: Configure Modes Overlay" },
          { label: "Screenshot placeholder: Mode Color and Label Inputs" },
        ],
      },
      {
        id: "ug-settings",
        title: "Settings",
        icon: "/icon-settings.png",
        paragraphs: [
          "Settings is the central control panel for app-wide behavior. It includes appearance, task defaults, category management, history manager access, and backup tools.",
          "Task Settings lets you set default milestone unit and enable or disable dynamic colors for progress/history visuals.",
          "Appearance controls theme mode, and support links provide About, User Guide, and Contact overlays.",
        ],
        shots: [
          { label: "Screenshot placeholder: Settings Main Menu" },
          { label: "Screenshot placeholder: Appearance Overlay" },
          { label: "Screenshot placeholder: Task Settings Overlay" },
        ],
      },
      {
        id: "ug-data",
        title: "Backup and Reset",
        icon: "/icon-settings.png",
        paragraphs: [
          "Export Backup creates a JSON file containing tasks, mode settings, and history. Keep exports as periodic snapshots for recovery and transfer.",
          "Import Backup merges data into the current dataset. Imported tasks are normalized and re-keyed when ID collisions occur to avoid overwriting existing tasks.",
          "Reset All supports confirmation options, including session logging behavior. Use reset operations carefully because they affect active timer state and stored history.",
        ],
        shots: [
          { label: "Screenshot placeholder: Export Backup Action" },
          { label: "Screenshot placeholder: Import Backup Action" },
          { label: "Screenshot placeholder: Reset All Confirmation" },
        ],
      },
      {
        id: "ug-mobile",
        title: "Mobile Usage",
        icon: "/icon-settings.png",
        paragraphs: [
          "The UI is responsive down to narrow mobile widths. Task actions, chart controls, and settings layouts are optimized to avoid overlap and preserve touch targets.",
          "Inline history chart supports swipe gestures for pagination. On small screens, labels are compacted and angled for legibility.",
          "If a route appears incorrect after a build, rebuild and sync packaged assets to ensure WebView uses the latest exported files.",
        ],
        shots: [
          { label: "Screenshot placeholder: Mobile Task List Layout" },
          { label: "Screenshot placeholder: Mobile Inline History Chart" },
          { label: "Screenshot placeholder: Mobile Settings Layout" },
        ],
      },
      {
        id: "ug-troubleshoot",
        title: "Troubleshooting",
        icon: "/icon-settings.png",
        paragraphs: [
          "If buttons navigate to unexpected pages in packaged builds, verify route output files exist in the exported `out` directory and rebuild the Android package after syncing.",
          "If chart colors look wrong, check whether Dynamic Colors is enabled in Task Settings. Disabled mode forces static mode color.",
          "For data issues, export a backup first, then use History Manager to inspect entries or perform controlled cleanup.",
        ],
        shots: [
          { label: "Screenshot placeholder: Route Issue Example" },
          { label: "Screenshot placeholder: Color Logic Verification" },
          { label: "Screenshot placeholder: History Cleanup Workflow" },
        ],
      },
    ],
    []
  );
  const [activeId, setActiveId] = useState("ug-nav");

  return (
    <div className="wrap" id="app" aria-label="TaskTimer User Guide">
      <div className="userGuidePage">
        <div className="userGuideTopAction">
          <button
            className="btn btn-accent userGuideBackBtn"
            type="button"
            onClick={() => (window.location.href = appRoute("/tasktimer/settings"))}
          >
            Back
          </button>
        </div>
        <aside className="userGuideToc">
          <div className="userGuideTocTitle">Contents</div>
          {sections.map((s) => {
            const isOn = activeId === s.id;
            return (
              <div className="userGuideTopic" key={s.id}>
                <button className={`userGuideTocItem${isOn ? " isOn" : ""}`} type="button" onClick={() => setActiveId(s.id)}>
                  {s.title}
                </button>
                {isOn ? (
                  <div className="modalSubtext userGuideText userGuideWindow userGuideTopicPanel">
                    <section className="userGuideSection">
                      <h3>
                        <img className="userGuideIcon" src={s.icon} alt="" aria-hidden="true" />
                        {s.title}
                      </h3>
                      {s.paragraphs.map((para, idx) => (
                        <p key={`${s.id}-p-${idx}`}>{para}</p>
                      ))}
                      {s.shots.map((shot, idx) =>
                        shot.image ? (
                          <img key={`${s.id}-shot-${idx}`} className="userGuideShotImage" src={shot.image} alt={`${s.title} screenshot ${idx + 1}`} />
                        ) : (
                          <div key={`${s.id}-shot-${idx}`} className="userGuideShotPlaceholder">
                            {shot.label}
                          </div>
                        )
                      )}
                    </section>
                  </div>
                ) : null}
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
