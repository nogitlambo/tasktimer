import type { TaskTimerElements } from "./elements";
import type { TaskTimerRuntime } from "./runtime";
import type { AppPage } from "./types";

export type TaskTimerAppPageSyncUrlMode = "replace" | "push" | false;

export type TaskTimerAppShellContext = {
  els: TaskTimerElements;
  runtime: TaskTimerRuntime;
  on: TaskTimerRuntime["on"];
  initialAppPage: AppPage;
  navStackKey: string;
  navStackMax: number;
  nativeBackDebounceMs: number;
  getCurrentAppPage: () => AppPage;
  setCurrentAppPage: (page: AppPage) => void;
  getSuppressNavStackPush: () => boolean;
  setSuppressNavStackPush: (value: boolean) => void;
  getNavStackMemory: () => string[];
  setNavStackMemory: (stack: string[]) => void;
  getLastNativeBackHandledAtMs: () => number;
  setLastNativeBackHandledAtMs: (ms: number) => void;
  resetAllOpenHistoryChartSelections: () => void;
  clearTaskFlipStates: () => void;
  renderFriendsFooterAlertBadge: () => void;
  closeTaskExportModal: () => void;
  closeShareTaskModal: () => void;
  closeFriendProfileModal: () => void;
  closeFriendRequestModal: () => void;
  render: () => void;
  renderHistory: (taskId: string) => void;
  renderDashboardWidgets: (opts?: { includeAvgSession?: boolean }) => void;
  renderGroupsPage: () => void;
  refreshGroupsData: (opts?: { preserveStatus?: boolean }) => Promise<void>;
  getOpenHistoryTaskIds: () => Iterable<string>;
  closeTopOverlayIfOpen: () => boolean;
  closeMobileDetailPanelIfOpen: () => boolean;
  showExitAppConfirm: () => void;
};
