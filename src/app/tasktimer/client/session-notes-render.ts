import type { DeletedTaskMeta, HistoryByTaskId, LiveSessionsByTaskId, Task } from "../lib/types";
import { normalizeHistoryTimestampMs } from "../lib/history";
import { prepareRichNoteForDisplay, richNoteHasMeaningfulText, richNotePlainText } from "./rich-session-notes";

type SessionNotesRenderArgs = {
  listEl: HTMLElement | null;
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  liveSessionsByTaskId: LiveSessionsByTaskId;
  deletedTaskMeta: DeletedTaskMeta;
};

type SessionNoteRow = {
  taskId: string;
  taskName: string;
  taskState: "active" | "archived";
  ts: number;
  elapsedMs: number;
  noteHtml: string;
  noteText: string;
  isLive: boolean;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateLabel(ts: number) {
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatTimeLabel(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function getLocalDateKey(ts: number) {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatElapsed(msRaw: unknown) {
  const totalMinutes = Math.max(0, Math.floor((Number(msRaw) || 0) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function collectSessionNotesRows(args: Omit<SessionNotesRenderArgs, "listEl">): SessionNoteRow[] {
  const taskById = new Map((args.tasks || []).map((task) => [String(task.id), task] as const));
  const rows: SessionNoteRow[] = [];

  Object.entries(args.historyByTaskId || {}).forEach(([taskId, entries]) => {
    const task = taskById.get(String(taskId));
    const deletedMeta = args.deletedTaskMeta?.[taskId];
    const taskState = task ? "active" : deletedMeta?.state === "archived" ? "archived" : null;
    if (!taskState) return;
    const taskName = String(task?.name || deletedMeta?.name || "Task").trim() || "Task";
    (entries || []).forEach((entry) => {
      const noteHtml = prepareRichNoteForDisplay(entry?.note);
      if (!richNoteHasMeaningfulText(noteHtml)) return;
      const ts = normalizeHistoryTimestampMs(entry?.ts);
      if (!ts) return;
      rows.push({
        taskId,
        taskName,
        taskState,
        ts,
        elapsedMs: Math.max(0, Math.floor(Number(entry?.ms) || 0)),
        noteHtml,
        noteText: richNotePlainText(noteHtml),
        isLive: false,
      });
    });
  });

  Object.entries(args.liveSessionsByTaskId || {}).forEach(([taskId, session]) => {
    const task = taskById.get(String(taskId));
    if (!task) return;
    const noteHtml = prepareRichNoteForDisplay(session?.note);
    if (!richNoteHasMeaningfulText(noteHtml)) return;
    const ts = normalizeHistoryTimestampMs(session?.startedAtMs || session?.updatedAtMs);
    if (!ts) return;
    rows.push({
      taskId,
      taskName: String(task.name || session?.name || "Task").trim() || "Task",
      taskState: "active",
      ts,
      elapsedMs: Math.max(0, Math.floor(Number(session?.elapsedMs) || 0)),
      noteHtml,
      noteText: richNotePlainText(noteHtml),
      isLive: true,
    });
  });

  return rows.sort((left, right) => right.ts - left.ts);
}

export function renderSessionNotesHtml(args: Omit<SessionNotesRenderArgs, "listEl">) {
  const rows = collectSessionNotesRows(args);
  if (!rows.length) return '<div class="sessionNotesEmpty">No session notes yet.</div>';

  const rowsByTask = new Map<string, SessionNoteRow[]>();
  rows.forEach((row) => {
    if (!rowsByTask.has(row.taskId)) rowsByTask.set(row.taskId, []);
    rowsByTask.get(row.taskId)?.push(row);
  });

  return Array.from(rowsByTask.entries())
    .sort((left, right) => (right[1][0]?.ts || 0) - (left[1][0]?.ts || 0))
    .map(([, taskRows]) => {
      const firstRow = taskRows[0];
      const dateGroups = new Map<string, SessionNoteRow[]>();
      taskRows.forEach((row) => {
        const dateKey = getLocalDateKey(row.ts);
        if (!dateGroups.has(dateKey)) dateGroups.set(dateKey, []);
        dateGroups.get(dateKey)?.push(row);
      });
      const datesHtml = Array.from(dateGroups.entries())
        .sort((left, right) => (left[0] < right[0] ? 1 : left[0] > right[0] ? -1 : 0))
        .map(([, dateRows]) => {
          const notesHtml = dateRows
            .sort((left, right) => right.ts - left.ts)
            .map(
              (row) => `
                <article class="sessionNoteCard">
                  <div class="sessionNoteMeta">
                    <span>${escapeHtml(formatTimeLabel(row.ts))}</span>
                    <span>${escapeHtml(formatElapsed(row.elapsedMs))}</span>
                    ${row.isLive ? '<span class="sessionNoteLive">Live</span>' : ""}
                  </div>
                  <div class="sessionNoteBody" title="${escapeHtml(row.noteText)}">${row.noteHtml}</div>
                </article>
              `
            )
            .join("");
          return `
            <section class="sessionNotesDateGroup">
              <h3 class="sessionNotesDateTitle">${escapeHtml(formatDateLabel(dateRows[0]?.ts || 0))}</h3>
              <div class="sessionNotesDateList">${notesHtml}</div>
            </section>
          `;
        })
        .join("");
      return `
        <section class="sessionNotesTaskGroup">
          <header class="sessionNotesTaskHeader">
            <h2 class="sessionNotesTaskTitle">${escapeHtml(firstRow?.taskName || "Task")}</h2>
            ${firstRow?.taskState === "archived" ? '<span class="sessionNotesTaskState">Archived</span>' : ""}
          </header>
          ${datesHtml}
        </section>
      `;
    })
    .join("");
}

export function renderSessionNotesPage(args: SessionNotesRenderArgs) {
  if (!args.listEl) return;
  args.listEl.innerHTML = renderSessionNotesHtml(args);
}
