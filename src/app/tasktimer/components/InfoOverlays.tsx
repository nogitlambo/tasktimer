import AppImg from "@/components/AppImg";
import InfoOverlayFrame from "./InfoOverlayFrame";

export default function InfoOverlays() {
  return (
    <>
      <InfoOverlayFrame overlayId="aboutOverlay" ariaLabel="About" footerClassName="footerBtns">
        <div className="aboutHead">
          <AppImg className="aboutLogo" alt="Timebase logo" src="/timebase-logo.svg" />
          <div>
            <h2 className="aboutTitle">Timebase</h2>
            <div className="aboutKicker">Focused time tracking with progress and history</div>
          </div>
        </div>

        <div className="aboutText aboutTextBody">
          <p className="aboutLead">
            Timebase is built for tracking focused work across multiple tasks, with a fast workflow for start/stop
            timing, reviewing progress, and managing your history.
          </p>
          <p>Key features include:</p>
          <ul className="aboutFeatureList">
            <li>Per-task timers with start, stop, reset, duplication, and manual editing controls</li>
            <li>Checkpoint milestones and progress tracking on each task</li>
            <li>Inline history charts with entry/day views, selection tools, export, analysis, and manager access</li>
            <li>Focus Mode for a single-task timer view with dedicated controls and insights</li>
            <li>Backup export/import, including import merge/overwrite options</li>
            <li>Dashboard and guide pages for overview and support</li>
          </ul>
        </div>
      </InfoOverlayFrame>

      <InfoOverlayFrame overlayId="howtoOverlay" ariaLabel="How To" title="How To">
        <div className="modalSubtext howtoBody">
          <p>
            <b>Tracking:</b> Use Start to start, Stop to stop, and Reset to reset. Reset can optionally log a history
            entry.
          </p>
          <p>
            <b>History:</b> Use Chart on a task to view the last 7 days. Use the arrows to page older entries.
          </p>
          <p>
            <b>Backup:</b> Use Export Backup to save your data. Use Import Backup to merge a saved backup back into the
            app.
          </p>
          <p>
            <b>Editing:</b> Use Edit to edit a task&apos;s name, total time, milestones, and appearance options. Manual
            time changes do not create a history entry until you reset.
          </p>
          <p>
            <b>Deleting:</b> Use Delete to delete a task. You can optionally clear that task&apos;s history during
            deletion.
          </p>
          <p>
            <b>Milestones:</b> Enable milestones in Edit to show progress markers for hours and descriptions.
            Milestones can be sorted and edited.
          </p>
        </div>
      </InfoOverlayFrame>

      <InfoOverlayFrame overlayId="appearanceOverlay" ariaLabel="Appearance" title="Appearance">
        <p className="modalSubtext">Appearance settings are now available in Settings &gt; Preferences.</p>
      </InfoOverlayFrame>

      <InfoOverlayFrame overlayId="taskSettingsOverlay" ariaLabel="Task Settings" title="Task Settings">
        <p className="modalSubtext">Task settings are now available in Settings &gt; Preferences.</p>
      </InfoOverlayFrame>
    </>
  );
}
