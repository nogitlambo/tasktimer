import type { AppPage } from "./types";
import { createInitialTaskTimerState, createTaskTimerStorageKeys } from "./state";

export type TaskTimerStateAccessor<T> = {
  get: () => T;
  set: (value: T) => void;
};

export function createTaskTimerRootBootstrap(initialAppPage: AppPage, storageKey: string) {
  return {
    initialState: createInitialTaskTimerState(initialAppPage),
    storageKeys: createTaskTimerStorageKeys(storageKey),
  };
}
