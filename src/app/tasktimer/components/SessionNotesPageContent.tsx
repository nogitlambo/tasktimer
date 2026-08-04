"use client";

import { useState } from "react";

type SessionNotesPageContentProps = {
  active: boolean;
};

type SessionNotesTaskFilter = "active" | "archived";

export default function SessionNotesPageContent({ active }: SessionNotesPageContentProps) {
  const [taskFilter, setTaskFilter] = useState<SessionNotesTaskFilter>("active");

  return (
    <section
      className={`appPage${active ? " appPageOn" : ""}`}
      id="appPageSessionNotes"
      aria-label="Notes page"
      data-session-notes-filter={taskFilter}
    >
      <div className="sessionNotesShell">
        <div className="sessionNotesFilterWrap">
          <div className="unitButtons taskScreenPillGroup sessionNotesFilterPills" role="group" aria-label="Task note filter">
            <button
              className={`btn taskScreenHeaderBtn taskScreenPill${taskFilter === "active" ? " isOn" : ""}`}
              type="button"
              aria-pressed={taskFilter === "active"}
              onClick={() => setTaskFilter("active")}
            >
              Active
            </button>
            <button
              className={`btn taskScreenHeaderBtn taskScreenPill${taskFilter === "archived" ? " isOn" : ""}`}
              type="button"
              aria-pressed={taskFilter === "archived"}
              onClick={() => setTaskFilter("archived")}
            >
              Archived
            </button>
          </div>
        </div>
        <div className="sessionNotesList" id="sessionNotesList" aria-live="polite">
          <div className="sessionNotesEmpty">No notes yet.</div>
        </div>
      </div>
    </section>
  );
}
