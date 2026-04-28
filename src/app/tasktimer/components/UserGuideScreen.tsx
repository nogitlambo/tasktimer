import React, { useMemo, useState } from "react";
import AppImg from "@/components/AppImg";
import DesktopAppRail from "./DesktopAppRail";

type GuideSection = {
  id: string;
  title: string;
  icon: string;
  paragraphs: string[];
  shots: Array<{ label: string; image?: string }>;
};

type Props = {
  onBack: () => void;
};

export default function UserGuideScreen({ onBack }: Props) {
  const sections = useMemo<GuideSection[]>(
    () => [
      {
        id: "ug-overview",
        title: "Overview",
        icon: "/Dashboard.svg",
        paragraphs: [
          "TaskLaunch is the authenticated TaskTimer workspace for planning tasks, launching focused work sessions, reviewing progress, managing history, and keeping account settings in one runtime.",
          "The main app routes are Tasks, Dashboard, Friends, Leaderboard, Settings, History Manager, User Guide, and Feedback. Tasks is where timers and schedules live; Dashboard and Leaderboard summarize progress; Settings owns account, preferences, notifications, data, and support tools.",
          "Most user data is stored through the TaskTimer storage and account sync flow. Export, import, reset, and destructive account actions live in Settings so timing workflows stay focused on active work.",
        ],
        shots: [
          { label: "Screenshot placeholder: TaskLaunch workspace overview" },
          { label: "Screenshot placeholder: Main app routes and desktop rail" },
          { label: "Screenshot placeholder: Settings data and account controls" },
        ],
      },
      {
        id: "ug-quick-start",
        title: "First Run",
        icon: "/Task_List.svg",
        paragraphs: [
          "Start on Tasks, choose Add Task, enter a task name, choose Recurring or Once-off, set a time goal or choose not to set one, select a planned start time, and optionally add Time Checkpoints.",
          "After a task appears in the list, use Start to launch timing, Stop to pause, and Reset when you are ready to clear the running total and save or discard the completed session.",
          "Use Settings early if you want to choose a startup module, switch Task View between List and Tile, set Week Starts On, change the theme, or enable notifications before your first work session.",
        ],
        shots: [
          { label: "Screenshot placeholder: Add Task wizard first step" },
          { label: "Screenshot placeholder: Task Start, Stop, and Reset controls" },
          { label: "Screenshot placeholder: Preferences pane for startup defaults" },
        ],
      },
      {
        id: "ug-nav",
        title: "Navigation",
        icon: "/Dashboard.svg",
        paragraphs: [
          "The desktop rail and mobile navigation switch between Dashboard, Tasks, Friends, Leaderboard, and Settings. Authenticated routes are protected, so signed-out users are redirected to the landing page.",
          "Tasks has a header switch for Tasks and Schedule plus the Add Task button and task ordering menu. Add Task controls are only shown in task context.",
          "Settings is a separate route with a module list and detail panel. On mobile, choosing a module opens a detail view with its own Back button; that Back returns to the settings module list rather than exiting the route.",
        ],
        shots: [
          { label: "Navigation Footer (Example)", image: "/navigation.PNG" },
          { label: "Screenshot placeholder: Tasks and Schedule header controls" },
          { label: "Screenshot placeholder: Settings split layout and mobile detail back" },
        ],
      },
      {
        id: "ug-dashboard",
        title: "Dashboard",
        icon: "/Dashboard.svg",
        paragraphs: [
          "Dashboard summarizes logged work with panels for XP Progress, Today, This Week, Completed, Momentum, Avg Session by Task, Timeline, and Focus Heatmap.",
          "Use Refresh dashboard to recalculate current data. Use Customize dashboard panels or Edit Dashboard Layout to choose which panels are shown and to finish with Done or cancel changes.",
          "Timeline density can be changed with Low, Medium, and High. Focus Heatmap opens day-level details, and Avg Session by Task can toggle between Past 7 Days and Past 30 Days.",
        ],
        shots: [
          { label: "Screenshot placeholder: Dashboard summary panels" },
          { label: "Screenshot placeholder: Customize Dashboard panel menu" },
          { label: "Screenshot placeholder: Timeline density and heatmap detail" },
        ],
      },
      {
        id: "ug-tasks",
        title: "Tasks",
        icon: "/Task_List.svg",
        paragraphs: [
          "Each task card or row supports Start or Stop, Reset, Edit, History, Focus, Duplicate, Collapse, Delete, and task export actions where available.",
          "The Add Task wizard supports Recurring and Once-off task types. Recurring tasks can use day or week time goals, while once-off tasks choose a day and use a day-based time goal.",
          "The task ordering menu can sort by A-Z, Schedule/Time, or Custom. Custom ordering preserves your manual order, while Schedule/Time uses planned start information.",
          "Manual edits in Edit change the current timer value, task type, time goal, planned start, checkpoints, and alert preferences. Manual timer edits do not create history until a reset or manual entry saves a log.",
        ],
        shots: [
          { label: "Screenshot placeholder: Task list or tile view" },
          { label: "Screenshot placeholder: Add Task recurring and once-off flow" },
          { label: "Screenshot placeholder: Task ordering menu" },
          { label: "Screenshot placeholder: Edit Task modal" },
        ],
      },
      {
        id: "ug-schedule",
        title: "Schedule",
        icon: "/Task_Settings.svg",
        paragraphs: [
          "Open Schedule from the Tasks header. The schedule panel shows a weekly planner and day tabs for Mon through Sun on smaller layouts.",
          "Tasks with a planned start appear on the schedule grid. Flexible or unscheduled tasks can appear in the Unscheduled Tasks tray.",
          "Use the Quick Place tray to drag a task onto the planner and assign a day and start time. Schedule changes stay part of the same task runtime used by Tasks and Dashboard.",
        ],
        shots: [
          { label: "Screenshot placeholder: Weekly schedule planner" },
          { label: "Screenshot placeholder: Mobile schedule day tabs" },
          { label: "Screenshot placeholder: Unscheduled Tasks Quick Place tray" },
        ],
      },
      {
        id: "ug-time-goals",
        title: "Time Goals",
        icon: "/Task_Settings.svg",
        paragraphs: [
          "Time goals can be set when adding or editing a task. Choose Minutes or Hours, then Day or Week where supported, or use Don't set a time goal for tasks without a target.",
          "When a time goal is completed, TaskLaunch can ask about challenge level and notes so the session has richer history for Focus Mode insights and Archie recommendations.",
          "Dashboard Today, This Week, Completed, and Momentum panels use logged history and goal progress to summarize how current work compares with planned work.",
        ],
        shots: [
          { label: "Screenshot placeholder: Time goal step in Add Task" },
          { label: "Screenshot placeholder: Task Complete challenge and note prompt" },
          { label: "Screenshot placeholder: Dashboard goal progress panels" },
        ],
      },
      {
        id: "ug-checkpoints",
        title: "Checkpoints",
        icon: "/Task_Settings.svg",
        paragraphs: [
          "Time Checkpoints are optional milestone markers during a task timer run. A checkpoint must be greater than zero and below the task time goal.",
          "Use Preset Intervals can auto-fill checkpoint times using a fixed increment. Preset checkpoint intervals are treated as a Pro feature in the Add Task flow.",
          "Checkpoint Alerts can use Sound Alert and Toast Alert. Sound alerts can play once or wait for dismissal, and toast alerts can dismiss after 5 seconds or wait for dismissal.",
        ],
        shots: [
          { label: "Screenshot placeholder: Time Checkpoints in Add Task" },
          { label: "Screenshot placeholder: Preset Intervals field" },
          { label: "Screenshot placeholder: Checkpoint Sound Alert and Toast Alert options" },
        ],
      },
      {
        id: "ug-focus",
        title: "Focus Mode",
        icon: "/Focus.svg",
        paragraphs: [
          "Open Focus Mode by selecting a task name or by enabling Auto switch to Focus Mode on launch in Settings > Preferences. The Focus dial starts or stops the selected task.",
          "Focus Mode shows the task name, elapsed days and clock, checkpoint ring markers, a Show Checkpoint Markers switch, and Notes for this session.",
          "Quick Stats include Highest logged time, Top productivity weekday, Today vs yesterday, This week vs last week, Recent challenge level, and In productivity period.",
        ],
        shots: [
          { label: "Screenshot placeholder: Focus dial and launch control" },
          { label: "Screenshot placeholder: Session notes and checkpoint markers" },
          { label: "Screenshot placeholder: Focus Mode Quick Stats" },
        ],
      },
      {
        id: "ug-history",
        title: "Inline History",
        icon: "/History_Manager.svg",
        paragraphs: [
          "Open History from a task to review recent session bars for that task. Inline history supports older and newer paging, 7-day and 14-day style ranges where available, and chart inspection.",
          "Pin keeps a task history panel open on the Tasks page. Manage opens the dedicated History Manager route when advanced history is available.",
          "Analyse is enabled only when 2 or more history columns are lock-selected. History notes and challenge ratings from completed sessions can appear in summaries and insights.",
        ],
        shots: [
          { label: "Screenshot placeholder: Inline task history chart" },
          { label: "Screenshot placeholder: Pinned history panel" },
          { label: "Screenshot placeholder: History analysis with selected columns" },
        ],
      },
      {
        id: "ug-history-manager",
        title: "History Manager",
        icon: "/History_Manager.svg",
        paragraphs: [
          "Open History Manager from Settings > Data > History Manager. The inline Manage action in task history can also take you to the same route when advanced history is available.",
          "History Manager groups logs by task and date. Use the DATE/TIME and ELAPSED buttons to change the active sort order while reviewing entries.",
          "Bulk Edit enables task-level, date-level, and row-level selection. Use Delete to remove selected entries after the confirmation summary, or use the row delete action for a single log.",
          "Manual history entries can be added with Date/Time, Elapsed hours and minutes, Sentiment, and optional Notes. Manual entries feed the same history data used by charts, dashboards, and Focus Mode insights.",
        ],
        shots: [
          { label: "Screenshot placeholder: History Manager overview" },
          { label: "Screenshot placeholder: DATE/TIME and ELAPSED sort controls" },
          { label: "Screenshot placeholder: Bulk Edit selection and Delete confirmation" },
          { label: "Screenshot placeholder: Add manual history entry modal" },
        ],
      },
      {
        id: "ug-settings",
        title: "Settings",
        icon: "/Settings.svg",
        paragraphs: [
          "Settings contains Account, Preferences, Appearance, Notifications, Help Center, Data, and About. Desktop opens Account by default; mobile starts from the module list unless a specific pane is requested.",
          "Preferences controls Auto switch to Focus Mode on launch, Load Module on App Startup, Task View, Week Starts On, Optimal Productivity Period, and Load Defaults.",
          "Appearance controls Color Theme with Purple, Cyan, and Lime swatches plus Load Defaults. Notifications controls Enable Mobile Push Notifications, Enable Web Push Notifications, Checkpoint Sound, and Checkpoint Toast.",
        ],
        shots: [
          { label: "Screenshot placeholder: Settings module list" },
          { label: "Screenshot placeholder: Preferences pane" },
          { label: "Screenshot placeholder: Appearance and Notifications panes" },
        ],
      },
      {
        id: "ug-account",
        title: "Account",
        icon: "/Settings.svg",
        paragraphs: [
          "Account shows your verified identity, Free or Pro plan label, Upgrade to Pro or Manage Subscription action, current rank, username, email address, UID, member since date, and sync status.",
          "Use the avatar frame to choose an included avatar or upload an image. Use the rank button to open the rank ladder and choose a rank insignia when your progress allows it.",
          "Delete Account is destructive and opens a confirmation modal. Sign Out is available from Settings navigation when an authenticated account is active and returns to the signed-out handoff flow.",
        ],
        shots: [
          { label: "Screenshot placeholder: Account identity card" },
          { label: "Screenshot placeholder: Avatar picker and rank ladder" },
          { label: "Screenshot placeholder: Delete Account confirmation" },
        ],
      },
      {
        id: "ug-data",
        title: "Backup and Reset",
        icon: "/Import.svg",
        paragraphs: [
          "Open Settings, then Data to access History Manager, Export Backup, Import Backup, and Reset All. Export Backup and Import Backup show Pro feature lock messaging for Free users.",
          "Export Backup downloads a JSON backup of supported task data. Import Backup opens a JSON file and may ask whether to Add or Overwrite when data already exists.",
          "Reset All opens the Delete Data confirmation. It always clears stored history, and you can also enable Also Delete All Tasks before entering DELETE to proceed.",
        ],
        shots: [
          { label: "Screenshot placeholder: Settings Data actions" },
          { label: "Screenshot placeholder: Export Backup and Import Backup lock state" },
          { label: "Screenshot placeholder: Delete Data confirmation with DELETE requirement" },
        ],
      },
      {
        id: "ug-friends",
        title: "Friends",
        icon: "/Friends.svg",
        paragraphs: [
          "Friends shows your friends list, tasks shared by you, incoming requests, and outgoing requests. Use Add Friend to send a request by email address.",
          "Shared tasks can be sent to all friends or specific friends from the Share Task modal. Shared task cards show live progress state, trend information, and task metadata where available.",
          "Friend Profile shows friend identity, member since information, rank, and a Delete Friend action. Incoming requests can be approved or declined from the Friends page.",
        ],
        shots: [
          { label: "Screenshot placeholder: Friends page sections" },
          { label: "Screenshot placeholder: Send Friend Request modal" },
          { label: "Screenshot placeholder: Share Task modal and friend profile" },
        ],
      },
      {
        id: "ug-leaderboard",
        title: "Leaderboard",
        icon: "/Dashboard.svg",
        paragraphs: [
          "Leaderboard compares public focus progress with Top focus performers, Your position, Rising this week, and Closest rivals panels.",
          "Rows combine avatar, display label, total focused time, streak days, XP, weekly XP gain, and rank insignia. Your position also shows focus logged, current streak, and weekly XP.",
          "Leaderboard data depends on signed-in profile sync. If there is not enough public data yet, panels show empty-state messages until profiles and focus snapshots are available.",
        ],
        shots: [
          { label: "Screenshot placeholder: Global ladder leaderboard" },
          { label: "Screenshot placeholder: Your position panel" },
          { label: "Screenshot placeholder: Rising this week and closest rivals" },
        ],
      },
      {
        id: "ug-feedback",
        title: "Feedback",
        icon: "/Feedback.svg",
        paragraphs: [
          "Open Feedback from Settings > Help Center or the Feedback route. The form supports Email Address, Log as anonymous, Feedback Type, Title, Details, and Submit Feedback.",
          "Feedback Type includes Report a bug, General feedback, and Request a feature/enhancement. Signed-in users must provide enough information for the selected feedback type and details.",
          "Screenshots can be pasted into the Details field. Pasted images are resized before upload, listed as attachments, and can be removed before submission.",
        ],
        shots: [
          { label: "Screenshot placeholder: Feedback form" },
          { label: "Screenshot placeholder: Feedback Type options" },
          { label: "Screenshot placeholder: Pasted screenshot attachment list" },
        ],
      },
      {
        id: "ug-archie",
        title: "Archie",
        icon: "/About.svg",
        paragraphs: [
          "Archie is the in-app assistant available from the desktop rail and mobile assistant surface. It can answer product questions from the current guide, settings surfaces, and product policy entries.",
          "Free users can ask product questions. Pro-only Archie features include workflow recommendations, reviewable draft changes, and AI-refined responses when the API requires an upgrade.",
          "Archie can prepare reviewable drafts for task order or schedule changes, but it does not apply those changes without your approval. Drafts open in Archie Draft Review with Cancel, Discard, and Apply actions.",
        ],
        shots: [
          { label: "Screenshot placeholder: Archie assistant prompt" },
          { label: "Screenshot placeholder: Archie product answer with citations" },
          { label: "Screenshot placeholder: Archie Draft Review modal" },
        ],
      },
      {
        id: "ug-mobile",
        title: "Mobile Usage",
        icon: "/Settings.svg",
        paragraphs: [
          "The same runtime powers direct route loads and in-app navigation on desktop, mobile web, and native builds. Mobile layouts use single-column panels, route-aware Back behavior, and larger touch targets.",
          "Settings and User Guide use list-first navigation on narrow screens. Selecting a module opens the detail panel, and the detail Back button returns to the list.",
          "Native/mobile detection is based on Capacitor native runtime or file runtime. Push notification behavior, exported routes, and Android asset sync should be validated after builds.",
        ],
        shots: [
          { label: "Screenshot placeholder: Mobile task list layout" },
          { label: "Screenshot placeholder: Mobile settings detail view" },
          { label: "Screenshot placeholder: Native/mobile notification setup" },
        ],
      },
      {
        id: "ug-troubleshoot",
        title: "Troubleshooting",
        icon: "/About.svg",
        paragraphs: [
          "If chart or progress colors look wrong, check Settings > Appearance for the active theme and task dynamic color behavior. Some history colors depend on task progress and completion data.",
          "If a route opens the wrong page in a native or exported build, rebuild and sync exported assets so the WebView has current `/tasklaunch`, `/dashboard`, `/friends`, `/settings`, `/history-manager`, `/user-guide`, and `/feedback` files.",
          "If history totals, dashboard panels, or Focus Mode insights look stale, use Dashboard refresh, inspect entries in History Manager, and export a backup before destructive cleanup.",
          "If notifications do not appear, confirm the Notifications toggles, browser or native permission status, and whether checkpoint alerts are enabled on the task itself.",
        ],
        shots: [
          { label: "Screenshot placeholder: Theme and chart color settings" },
          { label: "Screenshot placeholder: Route navigation verification" },
          { label: "Screenshot placeholder: History cleanup workflow" },
          { label: "Screenshot placeholder: Notification and checkpoint alert settings" },
        ],
      },
      {
        id: "ug-about",
        title: "About",
        icon: "/About.svg",
        paragraphs: [
          "About summarizes TaskLaunch as the authenticated TaskTimer app for live work sessions, progress review, history management, and account-aware app settings.",
          "The app is designed to reduce context switching by keeping timing, review, history cleanup, settings, and support in one authenticated workspace.",
          "Use the User Guide for task-level help, Settings for configuration, Feedback for product issues and ideas, and Archie for short product answers grounded in current documentation.",
        ],
        shots: [
          { label: "Screenshot placeholder: About summary" },
          { label: "Screenshot placeholder: Settings Help Center links" },
          { label: "Screenshot placeholder: Archie help entry point" },
        ],
      },
    ],
    []
  );

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const selectedTopic = sections.find((s) => s.id === selectedTopicId) || null;

  return (
    <div className="wrap" id="app" aria-label="TaskLaunch User Guide">
      <div className="topbar topbarBrandOnly" aria-label="TaskLaunch header">
        <div className="brand landingV2FooterBrand appBrandLandingReplica displayFont">
          <AppImg
            className="landingV2HeaderBrandIcon appBrandLandingReplicaIcon"
            src="/logo/launch-icon-original-transparent.png"
            alt=""
          />
          <span className="appBrandLandingReplicaText">TaskLaunch</span>
        </div>
      </div>
      <div className="desktopAppShell">
        <DesktopAppRail activePage="settings" useClientNavButtons={false} showMobileFooter={false} />
        <div className="desktopAppMain">
          <div className="list settingsPageList userGuidePage" style={{ paddingTop: 18 }}>
            <div className="settingsSceneBackdrop" aria-hidden="true">
              <div className="settingsSceneGlow settingsSceneGlowA" />
              <div className="settingsSceneGlow settingsSceneGlowB" />
            </div>
            <div className="menu settingsMenu userGuideMenu settingsDashboardShell dashboardShell" role="dialog" aria-modal="true" aria-label="User Guide">
              <div className="menuHead">
                <div className="menuTitle" aria-label="User Guide">
                  User Guide
                </div>
              </div>

              <div className={`settingsSplitLayout userGuideSplitLayout${mobileDetailOpen ? " isMobileDetailOpen" : ""}`}>
                <aside className="settingsNavPanel userGuideNavPanel dashboardCard" aria-label="User Guide topics">
                  <div className="settingsNavTopActions">
                    <button
                      className="btn btn-ghost small settingsNavExitBtn"
                      type="button"
                      onClick={onBack}
                      aria-label="Back"
                    >
                      Back
                    </button>
                  </div>
                  <div className="settingsSectionLabel settingsSideLabel">Topics</div>
                  <div className="settingsNavGrid userGuideNavGrid" role="list" aria-label="User Guide Topics">
                    {sections.map((s) => (
                      <button
                        className={`menuItem settingsNavTile${selectedTopicId === s.id ? " isActive" : ""}`}
                        key={s.id}
                        type="button"
                        aria-pressed={selectedTopicId === s.id}
                        onClick={() => {
                          setSelectedTopicId(s.id);
                          setMobileDetailOpen(true);
                        }}
                      >
                        <span className="settingsNavRowText">{s.title}</span>
                      </button>
                    ))}
                  </div>
                </aside>

                <div className={`settingsDetailPanel userGuideDetailPanel dashboardCard${mobileDetailOpen ? " isMobileOpen" : ""}`}>
                  <div className="settingsMobileDetailHead">
                    <button
                      type="button"
                      className="btn btn-ghost small settingsMobileBackBtn"
                      onClick={() => setMobileDetailOpen(false)}
                      aria-label="Back to topics"
                    >
                      Back
                    </button>
                    <div className="settingsMobileDetailHeadTitle">{selectedTopic?.title || "User Guide"}</div>
                  </div>

                  {!selectedTopic ? (
                    <div className="settingsDetailEmpty">Select a topic to view the guide content.</div>
                  ) : (
                    <section className="settingsDetailPane isActive userGuideTopicPane" aria-hidden="false">
                      <div className="settingsDetailHead userGuideTopicHead">
                        <h2 className="settingsDetailTitle userGuideTopicTitleInline">
                          <AppImg className="userGuideIcon" src={selectedTopic.icon} alt="" aria-hidden="true" />
                          {selectedTopic.title}
                        </h2>
                        <p className="settingsDetailText">Topic guide content and reference screenshots.</p>
                      </div>
                      <div className="settingsDetailBody userGuideTopicBody modalSubtext userGuideText">
                        <section className="userGuideSection">
                          {selectedTopic.paragraphs.map((para, idx) => (
                            <React.Fragment key={`${selectedTopic.id}-p-${idx}`}>
                              <p>{para}</p>
                              {selectedTopic.shots[idx]
                                ? selectedTopic.shots[idx].image ? (
                                    <AppImg
                                      className="userGuideShotImage"
                                      src={selectedTopic.shots[idx].image}
                                      alt={`${selectedTopic.title} screenshot ${idx + 1}`}
                                    />
                                  ) : (
                                    <div className="userGuideShotPlaceholder">{selectedTopic.shots[idx].label}</div>
                                  )
                                : null}
                            </React.Fragment>
                          ))}
                        </section>
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
    </div>
  );
}
