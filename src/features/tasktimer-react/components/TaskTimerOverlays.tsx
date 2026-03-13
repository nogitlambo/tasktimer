"use client";

import { useTaskTimerActions, useTaskTimerState } from "../hooks/useTaskTimer";
import { formatHistoryElapsed, getModeLabel, getSelectedHistoryEntries } from "../model/selectors";
import type { MainMode } from "../model/types";

const EDIT_MODES: MainMode[] = ["mode1", "mode2", "mode3"];

export default function TaskTimerOverlays() {
  const state = useTaskTimerState();
  const actions = useTaskTimerActions();
  const analysisTaskId = state.historyAnalysisTaskId;
  const analysisEntries = analysisTaskId ? getSelectedHistoryEntries(state, analysisTaskId) : [];
  const totalMs = analysisEntries.reduce((sum, entry) => sum + Number(entry.ms || 0), 0);
  const averageMs = analysisEntries.length ? Math.round(totalMs / analysisEntries.length) : 0;
  const confirmDialog = state.confirmDialog;
  const hasConfirmCheckbox = confirmDialog?.kind === "deleteTask" || confirmDialog?.kind === "resetTask";
  const confirmCheckboxLabel = hasConfirmCheckbox ? confirmDialog.checkboxLabel : "";
  const confirmCheckboxChecked = hasConfirmCheckbox ? confirmDialog.checkboxChecked : false;
  const confirmIsDelete = confirmDialog?.kind === "deleteTask" || confirmDialog?.kind === "deleteHistoryEntries";

  return (
    <>
      <div className="overlay" id="addTaskOverlay" style={{ display: state.addTaskDialogOpen ? "flex" : "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Add Task">
          <h2>Add Task</h2>
          <p className="modalSubtext">Create a new task in the React-driven Tasks workspace.</p>
          <div className="field">
            <label htmlFor="addTaskName">Task Name</label>
            <input
              id="addTaskName"
              className="text w100"
              type="text"
              value={state.addTaskDraft.name}
              onChange={(event) => actions.setAddTaskName(event.target.value)}
              placeholder="Enter a task name"
            />
          </div>
          <div className="field">
            <label htmlFor="addTaskModeSelect">Category</label>
            <select
              id="addTaskModeSelect"
              className="text w100"
              value={state.addTaskDraft.mode}
              onChange={(event) => actions.setAddTaskMode(event.target.value as MainMode)}
            >
              {EDIT_MODES.filter((mode) => mode === "mode1" || state.modeSettings[mode].enabled).map((mode) => (
                <option key={mode} value={mode}>
                  {getModeLabel(state, mode)}
                </option>
              ))}
            </select>
          </div>
          <div className="footerBtns">
            <button className="btn btn-ghost" id="addTaskCancelBtn" type="button" onClick={() => actions.closeAddTask()}>
              Cancel
            </button>
            <button className="btn btn-accent" id="addTaskConfirmBtn" type="button" onClick={() => actions.submitAddTask()}>
              Add Task
            </button>
          </div>
        </div>
      </div>

      <div className="overlay" id="editOverlay" style={{ display: state.editTaskDialogOpen ? "flex" : "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Edit Task">
          <div className="editHead">
            <h2>Edit Task</h2>
            <div className="editMoveWrap">
              <label htmlFor="editMoveMenuBtn">Category:</label>
              <details className="editMoveMenu" id="editMoveMenu">
                <summary className="taskMenuItem" id="editMoveMenuBtn" role="button">
                  <span id="editMoveCurrentLabel">{getModeLabel(state, state.editTaskDraft.mode)}</span>
                </summary>
                <div className="taskMenuList">
                  {EDIT_MODES.filter((mode) => mode === "mode1" || state.modeSettings[mode].enabled).map((mode) => (
                    <button
                      key={mode}
                      className="taskMenuItem editMoveItem"
                      id={`editMove${mode[0].toUpperCase()}${mode.slice(1)}`}
                      data-move-mode={mode}
                      type="button"
                      onClick={() => actions.setEditTaskMode(mode)}
                    >
                      {getModeLabel(state, mode)}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          </div>

          <div className="field">
            <label htmlFor="editName">Task Name</label>
            <input
              id="editName"
              className="text w100"
              type="text"
              value={state.editTaskDraft.name}
              onChange={(event) => actions.setEditTaskName(event.target.value)}
            />
          </div>

          <div className="footerBtns">
            <button className="btn btn-ghost" id="cancelEditBtn" type="button" onClick={() => actions.closeEditTask()}>
              Cancel
            </button>
            <button className="btn btn-accent" id="saveEditBtn" type="button" onClick={() => actions.saveEditTask()}>
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="overlay" id="confirmOverlay" style={{ display: confirmDialog ? "flex" : "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Confirm">
          <h2 id="confirmTitle">{confirmDialog?.title || "Confirm"}</h2>
          <div className="confirmText" id="confirmText">
            {confirmDialog?.text || ""}
          </div>

          <div
            className="chkRow"
            id="confirmChkRow"
            style={{
              display: hasConfirmCheckbox ? "flex" : "none",
            }}
          >
            <input
              key={`${confirmDialog?.kind || "none"}:${confirmDialog?.taskId || "none"}`}
              type="checkbox"
              id="confirmDeleteAll"
              defaultChecked={confirmCheckboxChecked}
            />
            <label htmlFor="confirmDeleteAll" id="confirmChkLabel">
              {confirmCheckboxLabel}
            </label>
          </div>

          <div className="confirmBtns">
            <button className="btn btn-ghost" id="confirmCancelBtn" type="button" onClick={() => actions.closeConfirmDialog()}>
              Cancel
            </button>
            <button
              className={`btn ${confirmIsDelete ? "btn-warn" : "btn-accent"}`}
              id="confirmOkBtn"
              type="button"
              onClick={() => {
                const checkbox = document.getElementById("confirmDeleteAll") as HTMLInputElement | null;
                actions.confirmDialog(checkbox?.checked);
              }}
            >
              {confirmDialog?.okLabel || "OK"}
            </button>
          </div>
        </div>
      </div>

      <div className="overlay" id="historyAnalysisOverlay" style={{ display: analysisTaskId ? "flex" : "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="History Analysis">
          <h2>History Analysis</h2>
          <p className="modalSubtext">
            React-powered inline analysis across {analysisEntries.length} selected session{analysisEntries.length === 1 ? "" : "s"}.
          </p>
          <div className="settingsDetailNote">
            Total elapsed: <strong>{formatHistoryElapsed(totalMs)}</strong>
          </div>
          <div className="settingsDetailNote">
            Average session: <strong>{formatHistoryElapsed(averageMs)}</strong>
          </div>
          <div className="settingsDetailNote">
            Longest session:{" "}
            <strong>{formatHistoryElapsed(Math.max(...analysisEntries.map((entry) => Number(entry.ms || 0)), 0))}</strong>
          </div>
          <div className="footerBtns">
            <button className="btn btn-ghost" type="button" onClick={() => actions.closeHistoryAnalysis()}>
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
