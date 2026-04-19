"use client";

import AppImg from "@/components/AppImg";

const DAY_BUTTONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

type SchedulePageContentProps = {
  active: boolean;
};

export default function SchedulePageContent({ active }: SchedulePageContentProps) {
  return (
    <section className={`appPage appPageSchedule${active ? " appPageOn" : ""}`} id="appPageSchedule" aria-label="Schedule page">
      <div className="dashboardTopRow scheduleTopRow">
        <div className="dashboardTitleWrap">
          <p className="dashboardKicker">Schedule</p>
        </div>
        <div className="taskPageHeaderActions schedulePageHeaderActions">
          <button
            className="iconBtn taskScreenPill taskScreenHeaderBtn"
            id="closeScheduleBtn"
            data-screen-pill="tasks"
            aria-label="Tasks"
            title="Tasks"
            role="tab"
            type="button"
          >
            <AppImg className="taskScreenIconBtnImage" src="/Task_List.svg" alt="" aria-hidden="true" />
          </button>
          <button
            className="iconBtn taskScreenPill taskScreenHeaderBtn isOn"
            data-screen-pill="schedule"
            aria-current="page"
            aria-label="Schedule"
            title="Schedule"
            role="tab"
            type="button"
          >
            <svg className="taskScreenIconBtnSvg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
              <path d="M3.5 9.5h17" />
              <path d="M8 3.75v3.5" />
              <path d="M16 3.75v3.5" />
              <path d="M8 13h3" />
              <path d="M13 13h3" />
              <path d="M8 17h3" />
            </svg>
          </button>
          <button
            className="iconBtn taskScreenPill taskScreenHeaderBtn"
            id="scheduleAddTaskBtn"
            aria-label="Add Task"
            title="Add Task"
            type="button"
          >
            <span className="taskScreenIconBtnPlus" aria-hidden="true">
              +
            </span>
          </button>
        </div>
      </div>

      <section className="schedulePageShell" aria-label="Weekly schedule planner">
        <div className="scheduleMobileDayTabs" id="scheduleMobileDayTabs" role="tablist" aria-label="Schedule day selector">
          {DAY_BUTTONS.map((day) => (
            <button
              key={day.value}
              className="btn btn-ghost small scheduleDayTab"
              data-schedule-day={day.value}
              id={`scheduleDayTab-${day.value}`}
              role="tab"
              type="button"
            >
              {day.label}
            </button>
          ))}
        </div>

        <div className="scheduleBoard">
          <div className="scheduleGridScroller" id="scheduleGridScroller">
            <div className="scheduleGrid" id="scheduleGrid" />
          </div>
        </div>

        <section className="scheduleTray" aria-label="Unscheduled tasks">
          <div className="scheduleTrayHeader">
            <div>
              <p className="scheduleTrayKicker">Quick Place</p>
              <h3 className="scheduleTrayTitle">Unscheduled Tasks</h3>
            </div>
            <p className="scheduleTrayHint">Drag a task onto the planner to assign a day and start time.</p>
          </div>
          <div className="scheduleTrayList" id="scheduleTrayList" />
        </section>
      </section>
    </section>
  );
}
