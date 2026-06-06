type SessionNotesPageContentProps = {
  active: boolean;
};

export default function SessionNotesPageContent({ active }: SessionNotesPageContentProps) {
  return (
    <section className={`appPage${active ? " appPageOn" : ""}`} id="appPageSessionNotes" aria-label="Session Notes page">
      <div className="sessionNotesShell">
        <header className="sessionNotesHeader">
          <div className="sessionNotesTitleBlock">
            <h1 className="sessionNotesTitle">Session Notes</h1>
            <p className="sessionNotesDescription">Review notes saved from focus sessions and manual history entries.</p>
          </div>
        </header>
        <div className="sessionNotesList" id="sessionNotesList" aria-live="polite">
          <div className="sessionNotesEmpty">No session notes yet.</div>
        </div>
      </div>
    </section>
  );
}
