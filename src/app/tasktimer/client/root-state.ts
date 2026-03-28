import type { AppPage } from "./types";
import { createInitialTaskTimerState, createTaskTimerStorageKeys } from "./state";

export type TaskTimerStateAccessor<T> = {
  get: () => T;
  set: (value: T) => void;
};

export function createTaskTimerStateAccessor<T>(get: () => T, set: (value: T) => void): TaskTimerStateAccessor<T> {
  return { get, set };
}

export function createTaskTimerRootBootstrap(initialAppPage: AppPage, storageKey: string) {
  return {
    initialState: createInitialTaskTimerState(initialAppPage),
    storageKeys: createTaskTimerStorageKeys(storageKey),
  };
}
