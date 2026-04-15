import type { TaskTimerStateAccessor } from "./root-state";

export type TaskTimerMutableStore<T extends object> = {
  state: T;
  get: <K extends keyof T>(key: K) => T[K];
  set: <K extends keyof T>(key: K, value: T[K]) => T[K];
  accessor: <K extends keyof T>(key: K) => TaskTimerStateAccessor<T[K]>;
};

export function createTaskTimerMutableStore<T extends object>(initialState: T): TaskTimerMutableStore<T> {
  const state = { ...initialState };

  return {
    state,
    get: (key) => state[key],
    set: (key, value) => {
      state[key] = value;
      return value;
    },
    accessor: (key) => ({
      get: () => state[key],
      set: (value) => {
        state[key] = value;
      },
    }),
  };
}
