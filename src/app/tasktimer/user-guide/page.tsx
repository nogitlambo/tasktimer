"use client";

import { useEffect, useMemo, useState } from "react";
import { initTaskTimerClient } from "../tasktimerClient";
import "../tasktimer.css";

export default function UserGuidePage() {
  useEffect(() => {
    const { destroy } = initTaskTimerClient();
    return () => destroy();
  }, []);

  const sections = useMemo(
    () => [
      {
        id: "ug-nav",
        title: "Navigation",
        icon: "/icon-dashboard.png",
        text: "Use footer tabs to move between Dashboard, Tasks, test pages, and Settings.",
        shot: "Screenshot placeholder: Navigation",
      },
      {
        id: "ug-tasks",
        title: "Tasks",
        icon: "/icon-tasks.png",
        text: "Create tasks with Add Task, edit with the Edit modal, and organize tasks by category.",
        shot: "Screenshot placeholder: Tasks",
      },
      {
        id: "ug-timers",
        title: "Timers and Checkpoints",
        icon: "/icon-tasks.png",
        text: "Each task supports Start/Stop/Reset and optional checkpoints (Day/Hour/Minute) with descriptions.",
        shot: "Screenshot placeholder: Timers and Checkpoints",
      },
      {
        id: "ug-history",
        title: "History",
        icon: "/icon-dashboard.png",
        text: "Use task history charts for recent sessions, swipe between pages, and manage entries in History Manager.",
        shot: "Screenshot placeholder: History",
      },
      {
        id: "ug-focus",
        title: "Focus Mode",
        icon: "/icon-settings.png",
        text: "Click a task name to open Focus Mode with circular progress, checkpoint markers, and quick stats.",
        shot: "Screenshot placeholder: Focus Mode",
      },
      {
        id: "ug-categories",
        title: "Categories",
        icon: "/icon-account.png",
        text: "Category 1 is always enabled. Category 2/3 can be enabled, disabled, renamed, and cleared in Category Manager.",
        shot: "Screenshot placeholder: Categories",
      },
      {
        id: "ug-settings",
        title: "Settings",
        icon: "/icon-settings.png",
        text: "Settings includes authentication actions, appearance theme toggle, support links, and data tools.",
        shot: "Screenshot placeholder: Settings",
      },
      {
        id: "ug-data",
        title: "Backup and Reset",
        icon: "/icon-settings.png",
        text: "Use Export Backup/Import Backup for JSON data portability. Use Reset All to clear timers with confirmation options.",
        shot: "Screenshot placeholder: Backup and Reset",
      },
    ],
    []
  );
  const [activeId, setActiveId] = useState("ug-nav");
  const activeSection = sections.find((s) => s.id === activeId) || sections[0];

  return (
    <div className="wrap" id="app" aria-label="TaskTimer User Guide">
      <div className="userGuidePage">
        <aside className="userGuideToc">
          <div className="userGuideTocTitle">Contents</div>
          {sections.map((s) => (
            <button
              key={s.id}
              className={`userGuideTocItem${activeId === s.id ? " isOn" : ""}`}
              type="button"
              onClick={() => setActiveId(s.id)}
            >
              {s.title}
            </button>
          ))}
        </aside>

        <div className="userGuideScroll">
          <div className="modal" role="dialog" aria-modal="true" aria-label="User Guide">
            <h2>User Guide</h2>
            <div className="modalSubtext userGuideText userGuideWindow">
              <section className="userGuideSection">
                <h3>
                  <img className="userGuideIcon" src={activeSection.icon} alt="" aria-hidden="true" />
                  {activeSection.title}
                </h3>
                <p>{activeSection.text}</p>
                <div className="userGuideShotPlaceholder">{activeSection.shot}</div>
              </section>
            </div>
            <div className="footerBtns">
              <button className="btn btn-accent" type="button" onClick={() => (window.location.href = "/tasktimer/settings")}>
                Back to Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
