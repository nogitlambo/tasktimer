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
    <section
      className={`appPageScheduleOverlay${active ? " isOpen" : ""}`}
      id="appPageSchedule"
      aria-label="Schedule panel"
      aria-hidden={active ? "false" : "true"}
      >
      <div className="schedulePageBackdrop" aria-hidden="true" />
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
      </section>
    </section>
  );
}
