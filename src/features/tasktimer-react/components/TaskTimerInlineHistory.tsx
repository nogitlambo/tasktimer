"use client";

import { useTaskTimerActions, useTaskTimerNavigation, useTaskTimerState } from "../hooks/useTaskTimer";
import {
  createHistoryEntryKey,
  formatHistoryElapsed,
  formatHistoryTimestamp,
  getHistoryEntriesForTask,
} from "../model/selectors";

type TaskTimerInlineHistoryProps = {
  taskId: string;
  taskName: string;
};

function downloadCsv(taskName: string, rows: ReturnType<typeof getHistoryEntriesForTask>) {
  if (!rows.length) return;
  const header = ["Timestamp", "Elapsed", "Name", "Note"];
  const lines = rows.map((row) => {
    const safe = (value: string) => `"${String(value).replaceAll('"', '""')}"`;
    return [
      safe(formatHistoryTimestamp(Number(row.ts || 0))),
      safe(formatHistoryElapsed(Number(row.ms || 0))),
      safe(String(row.name || taskName)),
      safe(String(row.note || "")),
    ].join(",");
  });
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${taskName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "task"}-history.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
}

export default function TaskTimerInlineHistory({ taskId, taskName }: TaskTimerInlineHistoryProps) {
  const state = useTaskTimerState();
  const actions = useTaskTimerActions();
  const navigation = useTaskTimerNavigation();
  const entries = getHistoryEntriesForTask(state, taskId);
  const selectedKeys = new Set(state.historySelectionByTaskId[taskId] || []);
  const selectedCount = selectedKeys.size;
  const isPinned = state.pinnedHistoryTaskIds.includes(taskId);

  return (
    <section className="historyInline" aria-label={`History for ${taskName}`}>
      <div className="historyTop">
        <div className="historyMeta">
          <div className="historyTitle historyInlineTitle">History</div>
        </div>
        <div className="historyMeta historyTopActions">
          <button
            className="iconBtn historyActionIconBtn historyTopIconBtn"
            type="button"
            data-history-action="export"
            aria-label="Export"
            title="Export"
            onClick={() => downloadCsv(taskName, entries)}
          >
            &#11123;
          </button>
          <button
            className="iconBtn historyActionIconBtn historyTopIconBtn"
            type="button"
            data-history-action="analyse"
            aria-label="Analysis"
            title={selectedCount >= 2 ? "Analysis" : "Select at least two entries"}
            disabled={selectedCount < 2}
            onClick={() => actions.openHistoryAnalysis(taskId)}
          >
            &#128269;
          </button>
          <button
            className="iconBtn historyActionIconBtn historyTopIconBtn"
            type="button"
            data-history-action="manage"
            aria-label="Manage"
            title="Manage"
            onClick={() => navigation.openHistoryManager(taskId)}
          >
            &#9881;
          </button>
          <button
            className="historyClearLockBtn"
            type="button"
            data-history-action="clearLocks"
            aria-label="Clear selected entries"
            title="Clear selected entries"
            style={{ display: selectedCount ? "inline-flex" : "none" }}
            onClick={() => actions.clearHistorySelection(taskId)}
          >
            X
          </button>
          <button
            className={`historyPinBtn${isPinned ? " isOn" : ""}`}
            type="button"
            data-history-action="pin"
            aria-label={isPinned ? "Unpin chart" : "Pin chart"}
            title={isPinned ? "Unpin chart" : "Pin chart"}
            onClick={() => actions.togglePinnedHistory(taskId)}
          >
            &#128204;
          </button>
        </div>
      </div>

      <div className="historyInlineList">
        {entries.length ? (
          entries.slice(0, 12).map((entry) => {
            const entryKey = createHistoryEntryKey(entry);
            const selected = selectedKeys.has(entryKey);
            return (
              <button
                key={entryKey}
                className={`historyInlineRow${selected ? " isSelected" : ""}`}
                type="button"
                onClick={() => actions.toggleHistorySelection(taskId, entryKey)}
              >
                <span className="historyInlineRowMeta">{formatHistoryTimestamp(Number(entry.ts || 0))}</span>
                <strong className="historyInlineRowElapsed">{formatHistoryElapsed(Number(entry.ms || 0))}</strong>
                <span className="historyInlineRowNote">{String(entry.note || "No note")}</span>
              </button>
            );
          })
        ) : (
          <div className="historyInlineEmpty">No completed history yet.</div>
        )}
      </div>

      <div className="historyRangeRow historyInlineFooterRow">
        <div className="historyRangeInfo">
          <div className="historyMeta historyRangeText">
            {entries.length ? `${entries.length} session${entries.length === 1 ? "" : "s"} available` : "Ready"}
          </div>
        </div>
        <div className="historyMeta historyRangeActions">
          <button
            className="btn btn-warn small"
            type="button"
            data-history-action="delete"
            disabled={!selectedCount}
            onClick={() => actions.requestDeleteHistorySelection(taskId)}
          >
            Delete Selected
          </button>
          <button
            className="btn btn-ghost small"
            type="button"
            data-history-action="close"
            onClick={() => actions.toggleHistory(taskId)}
          >
            Close
          </button>
        </div>
      </div>
    </section>
  );
}
