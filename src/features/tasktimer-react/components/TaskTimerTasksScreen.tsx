"use client";

import TaskList from "@/app/tasktimer/components/TaskList";
import { useTaskTimerActions, useTaskTimerState } from "../hooks/useTaskTimer";
import { getModeLabel } from "../model/selectors";
import type { MainMode } from "../model/types";

const MODES: MainMode[] = ["mode1", "mode2", "mode3"];

export default function TaskTimerTasksScreen() {
  const state = useTaskTimerState();
  const actions = useTaskTimerActions();

  return (
    <section className="appPage appPageOn" id="appPageTasks" aria-label="Tasks page">
      <div className="dashboardTopRow">
        <div className="dashboardTitleWrap">
          <p className="dashboardKicker">Workspace</p>
          <h2 className="dashboardTitle">Tasks</h2>
        </div>
      </div>

      <div className="modeSwitchWrap modeSwitchNoBrackets" style={{ display: "flex", justifyContent: "center" }}>
        <div className="modeSwitch" id="modeSwitch" aria-label="View modes">
          {MODES.map((mode) => {
            const enabled = mode === "mode1" ? true : state.modeSettings[mode].enabled;
            return (
              <button
                key={mode}
                className={`btn btn-ghost small modeBtn${state.currentMode === mode ? " isOn" : ""}`}
                id={`${mode}Btn`}
                type="button"
                data-mode={mode}
                disabled={!enabled}
                onClick={() => actions.setMode(mode)}
              >
                {getModeLabel(state, mode)}
              </button>
            );
          })}
        </div>
      </div>

      {MODES.map((mode) => (
        <section
          key={mode}
          className={`modeView${state.currentMode === mode ? " modeViewOn" : ""}`}
          id={`${mode}View`}
          aria-label={`${getModeLabel(state, mode)} view`}
        >
          {state.currentMode === mode ? <TaskList mode={mode} /> : null}
        </section>
      ))}

      <div className="controls">
        <button className="btn btn-ghost" id="openAddTaskBtn" type="button" style={{ width: "100%" }} onClick={() => actions.openAddTask()}>
          + Add Task
        </button>
      </div>
    </section>
  );
}
