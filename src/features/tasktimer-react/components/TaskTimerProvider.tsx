"use client";

import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { createBrowserTaskTimerNavigation, type TaskTimerNavigationAdapter } from "../adapters/navigation";
import { createStorageTaskRepository, type TaskRepository } from "../adapters/storageRepository";
import { createBrowserTaskTimerRuntime, type TaskTimerRuntimeAdapter } from "../adapters/runtime";
import { TaskTimerContext } from "../hooks/useTaskTimer";
import { createReducerInitialState, reduceTaskTimerState } from "../model/reducer";

type TaskTimerProviderProps = {
  children: ReactNode;
  navigation?: TaskTimerNavigationAdapter;
  repository?: TaskRepository;
  runtime?: TaskTimerRuntimeAdapter;
};

export default function TaskTimerProvider({
  children,
  navigation = createBrowserTaskTimerNavigation(),
  repository = createStorageTaskRepository(),
  runtime = createBrowserTaskTimerRuntime(),
}: TaskTimerProviderProps) {
  const [state, dispatch] = useReducer(reduceTaskTimerState, undefined, () => createReducerInitialState(runtime.now()));
  const hasHydratedRef = useRef(false);
  const prevTaskIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void repository.refreshSnapshot().then((snapshot) => {
      if (cancelled) return;
      dispatch({ type: "hydrate", snapshot, nowMs: runtime.now() });
      hasHydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [repository, runtime]);

  useEffect(() => runtime.startTicker((nowMs) => dispatch({ type: "tick", nowMs })), [runtime]);

  useEffect(() => {
    if (!hasHydratedRef.current || state.status !== "ready") return;
    const nextTaskIds = state.tasks.map((task) => task.id);
    const deletedTaskIds = prevTaskIdsRef.current.filter((taskId) => !nextTaskIds.includes(taskId));
    prevTaskIdsRef.current = nextTaskIds;
    void repository.saveTasks(state.tasks, { deletedTaskIds });
  }, [repository, state.status, state.tasks]);

  useEffect(() => {
    if (!hasHydratedRef.current || state.status !== "ready") return;
    void repository.saveHistory(state.historyByTaskId);
  }, [repository, state.historyByTaskId, state.status]);

  useEffect(() => {
    if (!hasHydratedRef.current || state.status !== "ready") return;
    void repository.saveDeletedMeta(state.deletedTaskMeta);
  }, [repository, state.deletedTaskMeta, state.status]);

  useEffect(() => {
    if (!hasHydratedRef.current || state.status !== "ready") return;
    void repository.savePinnedHistoryTaskIds(state.pinnedHistoryTaskIds);
  }, [repository, state.pinnedHistoryTaskIds, state.status]);

  useEffect(() => {
    if (!hasHydratedRef.current || state.status !== "ready") return;
    void repository.saveRecentCustomTaskNames(state.recentCustomTaskNames);
  }, [repository, state.recentCustomTaskNames, state.status]);

  useEffect(() => {
    document.body.setAttribute("data-app-page", "tasks");
    document.body.setAttribute("data-main-mode", state.currentMode);
    document.body.setAttribute("data-theme", state.themeMode);
    document.body.setAttribute("data-task-view", state.taskView);
    document.documentElement.style.setProperty("--mode-accent", state.modeSettings[state.currentMode].color);
    document.documentElement.style.setProperty("--mode1-accent", state.modeSettings.mode1.color);
    document.documentElement.style.setProperty("--mode2-accent", state.modeSettings.mode2.color);
    document.documentElement.style.setProperty("--mode3-accent", state.modeSettings.mode3.color);
  }, [state.currentMode, state.modeSettings, state.taskView, state.themeMode]);

  return (
    <TaskTimerContext.Provider value={{ state, dispatch, repository, runtime, navigation }}>
      {children}
    </TaskTimerContext.Provider>
  );
}
