import type { Task } from "../lib/types";
import type { TaskTimerMutableStore } from "./mutable-store";
import type {
  DashboardAvgRange,
  DashboardCardPlacement,
  DashboardCardSize,
  DashboardTimelineDensity,
} from "./types";

type DashboardLayoutState = {
  dashboardEditMode: boolean;
  dashboardDragEl: HTMLElement | null;
  dashboardOrderDraftBeforeEdit: string[] | null;
  dashboardCardPlacements: Record<string, DashboardCardPlacement>;
  dashboardCardPlacementsDraftBeforeEdit: Record<string, DashboardCardPlacement> | null;
  dashboardCardSizes: Record<string, DashboardCardSize>;
  dashboardCardSizesDraftBeforeEdit: Record<string, DashboardCardSize> | null;
  dashboardCardVisibility: Record<string, boolean>;
  dashboardAvgRange: DashboardAvgRange;
  dashboardTimelineDensity: DashboardTimelineDensity;
};

type EditState = {
  editIndex: number | null;
  editDraftSnapshot: string;
  editTaskDurationUnit: "minute" | "hour";
  editTaskDurationPeriod: "day" | "week";
  editTaskDraft: Task | null;
  elapsedPadTarget: HTMLInputElement | null;
  elapsedPadMilestoneRef:
    | {
        task: Task;
        milestone: { hours: number; description: string };
        ms: Task["milestones"];
        onApplied?: (() => void) | undefined;
      }
    | null;
  elapsedPadDraft: string;
  elapsedPadOriginal: string;
};

type AddTaskState = {
  addTaskWizardStep: 1 | 2 | 3 | 4 | 5;
  addTaskType: "recurring" | "once-off";
  addTaskOnceOffDay: Task["onceOffDay"] extends infer T ? Exclude<T, null | undefined> : never;
  addTaskPlannedStartTime: string;
  addTaskPlannedStartOpenEnded: boolean;
  addTaskDurationValue: number;
  addTaskDurationUnit: "minute" | "hour";
  addTaskDurationPeriod: "day" | "week";
  addTaskNoTimeGoal: boolean;
  addTaskMilestonesEnabled: boolean;
  addTaskMilestoneTimeUnit: "day" | "hour" | "minute";
  addTaskMilestones: Task["milestones"];
  addTaskCheckpointSoundEnabled: boolean;
  addTaskCheckpointSoundMode: "once" | "repeat";
  addTaskCheckpointToastEnabled: boolean;
  addTaskCheckpointToastMode: "auto5s" | "manual";
  addTaskPresetIntervalsEnabled: boolean;
  addTaskPresetIntervalValue: number;
  suppressAddTaskNameFocusOpen: boolean;
};

type FocusState = {
  focusModeTaskId: string | null;
  focusModeTaskName: string;
  focusShowCheckpoints: boolean;
  focusCheckpointSig: string;
  focusSessionNotesByTaskId: Record<string, string>;
  focusSessionNoteSaveTimer: number | null;
};

export function createTaskTimerDashboardLayoutBindings(
  dashboardUiState: TaskTimerMutableStore<DashboardLayoutState>
) {
  return {
    getDashboardEditMode: () => dashboardUiState.get("dashboardEditMode"),
    setDashboardEditMode: (value: boolean) => {
      dashboardUiState.set("dashboardEditMode", value);
    },
    getDashboardDragEl: () => dashboardUiState.get("dashboardDragEl"),
    setDashboardDragEl: (value: HTMLElement | null) => {
      dashboardUiState.set("dashboardDragEl", value);
    },
    getDashboardOrderDraftBeforeEdit: () => dashboardUiState.get("dashboardOrderDraftBeforeEdit"),
    setDashboardOrderDraftBeforeEdit: (value: string[] | null) => {
      dashboardUiState.set("dashboardOrderDraftBeforeEdit", value);
    },
    getDashboardCardPlacements: () => dashboardUiState.get("dashboardCardPlacements"),
    setDashboardCardPlacements: (value: Record<string, DashboardCardPlacement>) => {
      dashboardUiState.set("dashboardCardPlacements", value);
    },
    getDashboardCardPlacementsDraftBeforeEdit: () => dashboardUiState.get("dashboardCardPlacementsDraftBeforeEdit"),
    setDashboardCardPlacementsDraftBeforeEdit: (value: Record<string, DashboardCardPlacement> | null) => {
      dashboardUiState.set("dashboardCardPlacementsDraftBeforeEdit", value);
    },
    getDashboardCardSizes: () => dashboardUiState.get("dashboardCardSizes"),
    setDashboardCardSizes: (value: Record<string, DashboardCardSize>) => {
      dashboardUiState.set("dashboardCardSizes", value);
    },
    getDashboardCardSizesDraftBeforeEdit: () => dashboardUiState.get("dashboardCardSizesDraftBeforeEdit"),
    setDashboardCardSizesDraftBeforeEdit: (value: Record<string, DashboardCardSize> | null) => {
      dashboardUiState.set("dashboardCardSizesDraftBeforeEdit", value);
    },
    getDashboardCardVisibility: () => dashboardUiState.get("dashboardCardVisibility"),
    setDashboardCardVisibility: (value: Record<string, boolean>) => {
      dashboardUiState.set("dashboardCardVisibility", value);
    },
    getDashboardAvgRange: () => dashboardUiState.get("dashboardAvgRange"),
    setDashboardAvgRange: (value: DashboardAvgRange) => {
      dashboardUiState.set("dashboardAvgRange", value);
    },
    getDashboardTimelineDensity: () => dashboardUiState.get("dashboardTimelineDensity"),
    setDashboardTimelineDensity: (value: DashboardTimelineDensity) => {
      dashboardUiState.set("dashboardTimelineDensity", value);
    },
  };
}

export function createTaskTimerEditStateBindings(editTaskState: TaskTimerMutableStore<EditState>) {
  return {
    getEditIndex: () => editTaskState.get("editIndex"),
    setEditIndex: (value: number | null) => {
      editTaskState.set("editIndex", value);
    },
    getEditTaskDraft: () => editTaskState.get("editTaskDraft"),
    setEditTaskDraft: (value: Task | null) => {
      editTaskState.set("editTaskDraft", value);
    },
    setEditDraftSnapshot: (value: string) => {
      editTaskState.set("editDraftSnapshot", value);
    },
    getEditDraftSnapshot: () => editTaskState.get("editDraftSnapshot"),
    getEditTaskDurationUnit: () => editTaskState.get("editTaskDurationUnit"),
    setEditTaskDurationUnit: (value: "minute" | "hour") => {
      editTaskState.set("editTaskDurationUnit", value);
    },
    getEditTaskDurationPeriod: () => editTaskState.get("editTaskDurationPeriod"),
    setEditTaskDurationPeriod: (value: "day" | "week") => {
      editTaskState.set("editTaskDurationPeriod", value);
    },
    getElapsedPadTarget: () => editTaskState.get("elapsedPadTarget"),
    setElapsedPadTarget: (value: HTMLInputElement | null) => {
      editTaskState.set("elapsedPadTarget", value);
    },
    getElapsedPadMilestoneRef: () => editTaskState.get("elapsedPadMilestoneRef"),
    setElapsedPadMilestoneRef: (value: EditState["elapsedPadMilestoneRef"]) => {
      editTaskState.set("elapsedPadMilestoneRef", value);
    },
    getElapsedPadDraft: () => editTaskState.get("elapsedPadDraft"),
    setElapsedPadDraft: (value: string) => {
      editTaskState.set("elapsedPadDraft", value);
    },
    getElapsedPadOriginal: () => editTaskState.get("elapsedPadOriginal"),
    setElapsedPadOriginal: (value: string) => {
      editTaskState.set("elapsedPadOriginal", value);
    },
  };
}

export function createTaskTimerAddTaskStateBindings(addTaskState: TaskTimerMutableStore<AddTaskState>) {
  return {
    getAddTaskWizardStep: () => addTaskState.get("addTaskWizardStep"),
    setAddTaskWizardStepState: (value: 1 | 2 | 3 | 4 | 5) => {
      addTaskState.set("addTaskWizardStep", value);
    },
    getAddTaskType: () => addTaskState.get("addTaskType"),
    setAddTaskTypeState: (value: "recurring" | "once-off") => {
      addTaskState.set("addTaskType", value);
    },
    getAddTaskOnceOffDay: () => addTaskState.get("addTaskOnceOffDay"),
    setAddTaskOnceOffDayState: (value: AddTaskState["addTaskOnceOffDay"]) => {
      addTaskState.set("addTaskOnceOffDay", value);
    },
    getAddTaskPlannedStartTime: () => addTaskState.get("addTaskPlannedStartTime"),
    setAddTaskPlannedStartTimeState: (value: string) => {
      addTaskState.set("addTaskPlannedStartTime", value);
    },
    getAddTaskPlannedStartOpenEnded: () => addTaskState.get("addTaskPlannedStartOpenEnded"),
    setAddTaskPlannedStartOpenEndedState: (value: boolean) => {
      addTaskState.set("addTaskPlannedStartOpenEnded", value);
    },
    getAddTaskDurationValue: () => addTaskState.get("addTaskDurationValue"),
    setAddTaskDurationValueState: (value: number) => {
      addTaskState.set("addTaskDurationValue", value);
    },
    getAddTaskDurationUnit: () => addTaskState.get("addTaskDurationUnit"),
    setAddTaskDurationUnitState: (value: "minute" | "hour") => {
      addTaskState.set("addTaskDurationUnit", value);
    },
    getAddTaskDurationPeriod: () => addTaskState.get("addTaskDurationPeriod"),
    setAddTaskDurationPeriodState: (value: "day" | "week") => {
      addTaskState.set("addTaskDurationPeriod", value);
    },
    getAddTaskNoTimeGoal: () => addTaskState.get("addTaskNoTimeGoal"),
    setAddTaskNoTimeGoalState: (value: boolean) => {
      addTaskState.set("addTaskNoTimeGoal", value);
    },
    getAddTaskMilestonesEnabled: () => addTaskState.get("addTaskMilestonesEnabled"),
    setAddTaskMilestonesEnabledState: (value: boolean) => {
      addTaskState.set("addTaskMilestonesEnabled", value);
    },
    getAddTaskMilestoneTimeUnit: () => addTaskState.get("addTaskMilestoneTimeUnit"),
    setAddTaskMilestoneTimeUnitState: (value: "day" | "hour" | "minute") => {
      addTaskState.set("addTaskMilestoneTimeUnit", value);
    },
    getAddTaskMilestones: () => addTaskState.get("addTaskMilestones"),
    setAddTaskMilestonesState: (value: Task["milestones"]) => {
      addTaskState.set("addTaskMilestones", value);
    },
    getAddTaskCheckpointSoundEnabled: () => addTaskState.get("addTaskCheckpointSoundEnabled"),
    setAddTaskCheckpointSoundEnabledState: (value: boolean) => {
      addTaskState.set("addTaskCheckpointSoundEnabled", value);
    },
    getAddTaskCheckpointSoundMode: () => addTaskState.get("addTaskCheckpointSoundMode"),
    setAddTaskCheckpointSoundModeState: (value: "once" | "repeat") => {
      addTaskState.set("addTaskCheckpointSoundMode", value);
    },
    getAddTaskCheckpointToastEnabled: () => addTaskState.get("addTaskCheckpointToastEnabled"),
    setAddTaskCheckpointToastEnabledState: (value: boolean) => {
      addTaskState.set("addTaskCheckpointToastEnabled", value);
    },
    getAddTaskCheckpointToastMode: () => addTaskState.get("addTaskCheckpointToastMode"),
    setAddTaskCheckpointToastModeState: (value: "auto5s" | "manual") => {
      addTaskState.set("addTaskCheckpointToastMode", value);
    },
    getAddTaskPresetIntervalsEnabled: () => addTaskState.get("addTaskPresetIntervalsEnabled"),
    setAddTaskPresetIntervalsEnabledState: (value: boolean) => {
      addTaskState.set("addTaskPresetIntervalsEnabled", value);
    },
    getAddTaskPresetIntervalValue: () => addTaskState.get("addTaskPresetIntervalValue"),
    setAddTaskPresetIntervalValueState: (value: number) => {
      addTaskState.set("addTaskPresetIntervalValue", value);
    },
    getSuppressAddTaskNameFocusOpen: () => addTaskState.get("suppressAddTaskNameFocusOpen"),
    setSuppressAddTaskNameFocusOpenState: (value: boolean) => {
      addTaskState.set("suppressAddTaskNameFocusOpen", value);
    },
  };
}

export function createTaskTimerFocusBindings(focusState: TaskTimerMutableStore<FocusState>) {
  return {
    getFocusModeTaskId: () => focusState.get("focusModeTaskId"),
    setFocusModeTaskId: (value: string | null) => {
      focusState.set("focusModeTaskId", value);
    },
    getFocusModeTaskName: () => focusState.get("focusModeTaskName"),
    setFocusModeTaskName: (value: string) => {
      focusState.set("focusModeTaskName", value);
    },
    getFocusShowCheckpoints: () => focusState.get("focusShowCheckpoints"),
    setFocusShowCheckpoints: (value: boolean) => {
      focusState.set("focusShowCheckpoints", value);
    },
    getFocusCheckpointSig: () => focusState.get("focusCheckpointSig"),
    setFocusCheckpointSig: (value: string) => {
      focusState.set("focusCheckpointSig", value);
    },
    getFocusSessionNotesByTaskId: () => focusState.get("focusSessionNotesByTaskId"),
    setFocusSessionNotesByTaskId: (value: Record<string, string>) => {
      focusState.set("focusSessionNotesByTaskId", value);
    },
    getFocusSessionNoteSaveTimer: () => focusState.get("focusSessionNoteSaveTimer"),
    setFocusSessionNoteSaveTimer: (value: number | null) => {
      focusState.set("focusSessionNoteSaveTimer", value);
    },
  };
}
