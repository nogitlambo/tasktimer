"use client";

import TaskTimerInlineHistory from "./TaskTimerInlineHistory";
import { useTaskTimerActions, useTaskTimerState } from "../hooks/useTaskTimer";
import {
  fillBackgroundForPct,
  formatElapsedParts,
  getElapsedMs,
  getProgressViewModel,
} from "../model/selectors";
import type { TaskTimerTask } from "../model/types";

type TaskTimerTaskCardProps = {
  task: TaskTimerTask;
};

function renderMarkerClass(reached: boolean) {
  return reached ? "mkAch" : "mkPend";
}

export default function TaskTimerTaskCard({ task }: TaskTimerTaskCardProps) {
  const state = useTaskTimerState();
  const actions = useTaskTimerActions();
  const elapsedMs = getElapsedMs(task, state.clockNowMs);
  const elapsed = formatElapsedParts(elapsedMs);
  const progress = getProgressViewModel(task, state.clockNowMs);
  const showHistory = state.openHistoryTaskIds.includes(task.id);
  const isPinned = state.pinnedHistoryTaskIds.includes(task.id);

  return (
    <div className={`task${task.collapsed ? " collapsed" : ""}`} data-task-id={task.id} draggable="false">
      <div className="row">
        <button className="name" type="button" data-action="editName" title="Edit task" onClick={() => actions.openEditTask(task.id)}>
          {task.name}
        </button>

        <div className="time">
          <div className={`timePanel${task.running ? "" : " isStopped"}`}>
            <span className="timeChunk">
              <span className="timeBoxValue">{elapsed.days}</span>
              <span className="timeBoxUnit">d</span>
            </span>
            <span className="timeChunk">
              <span className="timeBoxValue">{elapsed.hours}</span>
              <span className="timeBoxUnit">h</span>
            </span>
            <span className="timeChunk">
              <span className="timeBoxValue">{elapsed.minutes}</span>
              <span className="timeBoxUnit">m</span>
            </span>
            <span className="timeChunk">
              <span className="timeBoxValue">{elapsed.seconds}</span>
              <span className="timeBoxUnit">s</span>
            </span>
          </div>
        </div>

        <div className="actions">
          {task.running ? (
            <button className="btn btn-warn small" type="button" data-action="stop" onClick={() => actions.stopTask(task.id)}>
              Stop
            </button>
          ) : (
            <button className="btn btn-accent small" type="button" data-action="start" onClick={() => actions.startTask(task.id)}>
              Launch
            </button>
          )}
          <button className="iconBtn" type="button" data-action="reset" title="Reset" onClick={() => actions.requestResetTask(task.id)}>
            &#10227;
          </button>
          <button className="iconBtn" type="button" data-action="edit" title="Edit" onClick={() => actions.openEditTask(task.id)}>
            &#9998;
          </button>
          <button
            className={`iconBtn historyActionBtn${showHistory || isPinned ? " isActive" : ""}${isPinned ? " isPinned" : ""}`}
            type="button"
            data-action="history"
            title={isPinned ? "History pinned" : "History"}
            aria-pressed={showHistory || isPinned}
            onClick={() => actions.toggleHistory(task.id)}
          >
            &#128202;
          </button>
          <details className="taskMenu">
            <summary className="iconBtn taskMenuBtn" title="More actions" aria-label="More actions">
              &#8942;
            </summary>
            <div className="taskMenuList">
              <button className="taskMenuItem" type="button" data-action="duplicate" onClick={() => actions.duplicateTask(task.id)}>
                Duplicate
              </button>
              <button className="taskMenuItem" type="button" data-action="collapse" onClick={() => actions.toggleCollapse(task.id)}>
                {task.collapsed ? "Show progress bar" : "Hide progress bar"}
              </button>
              <button className="taskMenuItem taskMenuItemDelete" type="button" data-action="delete" onClick={() => actions.requestDeleteTask(task.id)}>
                Delete
              </button>
            </div>
          </details>
        </div>
      </div>

      {progress.markers.length ? (
        <div className="progressRow">
          <div className="progressWrap">
            <div className="progressTrack">
              <div
                className="progressFill"
                style={{
                  width: `${progress.percent}%`,
                  background: state.dynamicColorsEnabled
                    ? fillBackgroundForPct(progress.percent)
                    : state.modeSettings[task.mode].color,
                }}
              />
              {progress.markers.map((marker) => (
                <span key={marker.id}>
                  <span className={`mkFlag ${renderMarkerClass(marker.reached)}`} style={{ left: `${marker.leftPct}%` }} />
                  <span className={`mkTime ${renderMarkerClass(marker.reached)}`} style={{ left: `${marker.leftPct}%` }}>
                    {marker.label}
                  </span>
                  {marker.description ? (
                    <span className={`mkDesc ${renderMarkerClass(marker.reached)}`} style={{ left: `${marker.leftPct}%` }}>
                      {marker.description}
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showHistory ? <TaskTimerInlineHistory taskId={task.id} taskName={task.name} /> : null}
    </div>
  );
}
