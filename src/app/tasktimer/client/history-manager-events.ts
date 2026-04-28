export const OPEN_HISTORY_MANAGER_MANUAL_ENTRY_EVENT = "tasktimer:open-history-manager-manual-entry";

export type OpenHistoryManagerManualEntryDetail = {
  taskId: string;
  taskName?: string;
};
