"use client";

import { useEffect, useMemo, useState } from "react";
import { initTaskTimerClient } from "../tasktimerClient";
import "../tasktimer.css";

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

  const sections = useMemo(
    () => [
      {
        id: "ug-nav",
        title: "Navigation",
        icon: "/icon-dashboard.png",
        text: "Use footer tabs to move between Dashboard, Tasks, test pages, and Settings.",
        shot: "Screenshot placeholder: Navigation",
        shotImage: "/navigation.PNG",
      },
      {
        id: "ug-tasks",
        title: "Tasks",
        icon: "/icon-tasks.png",
        text: "Create tasks with Add Task, edit with the Edit modal, and organize tasks by mode.",
        shot: "Screenshot placeholder: Tasks",
        shotImage: "",
      },
      {
        id: "ug-timers",
        title: "Timers and Checkpoints",
        icon: "/icon-tasks.png",
        text: "Each task supports Start/Stop/Reset and optional checkpoints (Day/Hour/Minute) with descriptions.",
        shot: "Screenshot placeholder: Timers and Checkpoints",
        shotImage: "",
      },
      {
        id: "ug-history",
        title: "History",
        icon: "/icon-dashboard.png",
        text: "Use task history charts for recent sessions, swipe between pages, and manage entries in History Manager.",
        shot: "Screenshot placeholder: History",
        shotImage: "",
      },
      {
        id: "ug-focus",
        title: "Focus Mode",
        icon: "/icon-settings.png",
        text: "Click a task name to open Focus Mode with circular progress, checkpoint markers, and quick stats.",
        shot: "Screenshot placeholder: Focus Mode",
        shotImage: "",
      },
      {
        id: "ug-modes",
        title: "Modes",
        icon: "/icon-account.png",
        text: "Mode 1 is always enabled. Mode 2/3 can be enabled, disabled, renamed, and cleared in Configure Modes.",
        shot: "Screenshot placeholder: Modes",
        shotImage: "",
      },
      {
        id: "ug-settings",
        title: "Settings",
        icon: "/icon-settings.png",
        text: "Settings includes authentication actions, appearance theme toggle, support links, and data tools.",
        shot: "Screenshot placeholder: Settings",
        shotImage: "",
      },
      {
        id: "ug-data",
        title: "Backup and Reset",
        icon: "/icon-settings.png",
        text: "Use Export Backup/Import Backup for JSON data portability. Use Reset All to clear timers with confirmation options.",
        shot: "Screenshot placeholder: Backup and Reset",
        shotImage: "",
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
                {activeSection.shotImage ? (
                  <img className="userGuideShotImage" src={activeSection.shotImage} alt={`${activeSection.title} screenshot`} />
                ) : (
                  <div className="userGuideShotPlaceholder">{activeSection.shot}</div>
                )}
              </section>
            </div>
            <div className="footerBtns">
              <button className="btn btn-accent" type="button" onClick={() => (window.location.href = appRoute("/tasktimer/settings"))}>
                Back to Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
