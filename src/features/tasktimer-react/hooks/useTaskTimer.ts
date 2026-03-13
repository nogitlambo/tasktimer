"use client";

import { createContext, useContext, type Dispatch } from "react";
import type { TaskTimerNavigationAdapter } from "../adapters/navigation";
import type { TaskRepository } from "../adapters/storageRepository";
import type { TaskTimerRuntimeAdapter } from "../adapters/runtime";
import type { TaskTimerAction, TaskTimerState } from "../model/types";

type TaskTimerContextValue = {
  state: TaskTimerState;
  dispatch: Dispatch<TaskTimerAction>;
  repository: TaskRepository;
  runtime: TaskTimerRuntimeAdapter;
  navigation: TaskTimerNavigationAdapter;
};

export const TaskTimerContext = createContext<TaskTimerContextValue | null>(null);

function useTaskTimerContext() {
  const value = useContext(TaskTimerContext);
  if (!value) throw new Error("TaskTimer React context is not available.");
  return value;
}

export function useTaskTimerState() {
  return useTaskTimerContext().state;
}

export function useTaskTimerDispatch() {
  return useTaskTimerContext().dispatch;
}

export function useTaskTimerNavigation() {
  return useTaskTimerContext().navigation;
}

export function useTaskTimerActions() {
  const { dispatch, runtime } = useTaskTimerContext();
  return {
    setMode(mode: "mode1" | "mode2" | "mode3") {
      dispatch({ type: "setMode", mode });
    },
    openAddTask() {
      dispatch({ type: "openAddTask" });
    },
    closeAddTask() {
      dispatch({ type: "closeAddTask" });
    },
    setAddTaskName(name: string) {
      dispatch({ type: "setAddTaskName", name });
    },
    setAddTaskMode(mode: "mode1" | "mode2" | "mode3") {
      dispatch({ type: "setAddTaskMode", mode });
    },
    submitAddTask() {
      dispatch({ type: "submitAddTask" });
    },
    openEditTask(taskId: string) {
      dispatch({ type: "openEditTask", taskId });
    },
    closeEditTask() {
      dispatch({ type: "closeEditTask" });
    },
    setEditTaskName(name: string) {
      dispatch({ type: "setEditTaskName", name });
    },
    setEditTaskMode(mode: "mode1" | "mode2" | "mode3") {
      dispatch({ type: "setEditTaskMode", mode });
    },
    saveEditTask() {
      dispatch({ type: "saveEditTask" });
    },
    startTask(taskId: string) {
      dispatch({ type: "startTask", taskId, nowMs: runtime.now() });
    },
    stopTask(taskId: string) {
      dispatch({ type: "stopTask", taskId, nowMs: runtime.now() });
    },
    requestResetTask(taskId: string) {
      dispatch({ type: "requestResetTask", taskId });
    },
    requestDeleteTask(taskId: string) {
      dispatch({ type: "requestDeleteTask", taskId });
    },
    duplicateTask(taskId: string) {
      dispatch({ type: "duplicateTask", taskId });
    },
    toggleCollapse(taskId: string) {
      dispatch({ type: "toggleCollapse", taskId });
    },
    toggleHistory(taskId: string) {
      dispatch({ type: "toggleHistory", taskId });
    },
    togglePinnedHistory(taskId: string) {
      dispatch({ type: "togglePinnedHistory", taskId });
    },
    toggleHistorySelection(taskId: string, entryKey: string) {
      dispatch({ type: "toggleHistorySelection", taskId, entryKey });
    },
    clearHistorySelection(taskId: string) {
      dispatch({ type: "clearHistorySelection", taskId });
    },
    requestDeleteHistorySelection(taskId: string) {
      dispatch({ type: "requestDeleteHistorySelection", taskId });
    },
    openHistoryAnalysis(taskId: string) {
      dispatch({ type: "openHistoryAnalysis", taskId });
    },
    closeHistoryAnalysis() {
      dispatch({ type: "closeHistoryAnalysis" });
    },
    closeConfirmDialog() {
      dispatch({ type: "closeConfirmDialog" });
    },
    confirmDialog(checkboxChecked?: boolean) {
      dispatch({ type: "confirmDialog", checkboxChecked });
    },
  };
}

export function useTaskTimerTask(taskId: string) {
  return useTaskTimerState().tasks.find((task) => task.id === taskId) || null;
}
