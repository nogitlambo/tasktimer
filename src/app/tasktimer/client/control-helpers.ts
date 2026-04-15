import type { TaskTimerRuntime } from "./runtime";

type EventBinder = TaskTimerRuntime["on"];

type BindToggleRowOptions = {
  on: EventBinder;
  control: EventTarget | null | undefined;
  row: EventTarget | null | undefined;
  ignoreSelector: string;
  handleToggle: (event: Event) => void;
};

export function eventTargetClosest(target: EventTarget | null, selector: string) {
  return target instanceof Element ? target.closest(selector) : null;
}

export function setSwitchState(el: HTMLElement | null | undefined, enabled: boolean) {
  if (!el) return;
  el.classList.toggle("on", enabled);
  el.setAttribute("aria-checked", String(enabled));
}

export function isSwitchEnabled(el: HTMLElement | null | undefined) {
  return !!el?.classList.contains("on");
}

export function bindToggleRow(opts: BindToggleRowOptions) {
  const { on, control, row, ignoreSelector, handleToggle } = opts;

  on(control, "click", (event: Event) => {
    event.preventDefault?.();
    handleToggle(event);
  });

  on(row, "click", (event: Event) => {
    if (eventTargetClosest(event.target, ignoreSelector)) return;
    handleToggle(event);
  });
}
