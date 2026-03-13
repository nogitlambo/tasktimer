export interface TaskTimerNavigationAdapter {
  openHistoryManager(taskId: string): void;
}

export function createBrowserTaskTimerNavigation(): TaskTimerNavigationAdapter {
  return {
    openHistoryManager(taskId) {
      window.location.href = `/tasktimer/history-manager?taskId=${encodeURIComponent(taskId)}`;
    },
  };
}
