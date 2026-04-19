"use client";

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
          <button className="btn btn-ghost small taskScreenPill" id="closeScheduleBtn" data-screen-pill="tasks" role="tab" type="button">
            Tasks
          </button>
          <button className="btn btn-ghost small taskScreenPill isOn" data-screen-pill="schedule" aria-current="page" role="tab" type="button">
            Schedule
          </button>
          <span className="taskScreenHeaderPipe" aria-hidden="true">
            |
          </span>
          <button className="btn btn-ghost small taskScreenPill" id="scheduleAddTaskBtn" type="button">
            + Add Task
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
