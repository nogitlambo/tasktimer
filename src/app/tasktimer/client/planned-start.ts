type PlannedStartParts = {
  hour: string;
  minute: string;
  meridiem: "AM" | "PM";
};

type PlannedStartSelectorGroup = {
  hourSelect: HTMLSelectElement | null | undefined;
  minuteSelect: HTMLSelectElement | null | undefined;
  meridiemSelect: HTMLSelectElement | null | undefined;
};

function padTwo(value: number) {
  return String(Math.max(0, Math.floor(value || 0))).padStart(2, "0");
}

function parsePlannedStartParts(raw: string | null | undefined): PlannedStartParts {
  const match = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  const hours24 = match ? Math.max(0, Math.min(23, Number(match[1] || 0))) : 9;
  const minutes = match ? Math.max(0, Math.min(59, Number(match[2] || 0))) : 0;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hour12 = hours24 % 12 || 12;
  return {
    hour: padTwo(hour12),
    minute: padTwo(minutes),
    meridiem,
  };
}

export function readPlannedStartValueFromSelectors(selectors: PlannedStartSelectorGroup) {
  const hour12 = Math.max(1, Math.min(12, Number(selectors.hourSelect?.value || "9") || 9));
  const minute = Math.max(0, Math.min(59, Number(selectors.minuteSelect?.value || "0") || 0));
  const meridiem = String(selectors.meridiemSelect?.value || "AM").trim().toUpperCase() === "PM" ? "PM" : "AM";
  let hours24 = hour12 % 12;
  if (meridiem === "PM") hours24 += 12;
  return `${padTwo(hours24)}:${padTwo(minute)}`;
}

export function syncPlannedStartSelectors(
  selectors: PlannedStartSelectorGroup,
  value: string | null | undefined,
  opts?: { disabled?: boolean }
) {
  const parts = parsePlannedStartParts(value);
  const disabled = !!opts?.disabled;
  if (selectors.hourSelect) {
    selectors.hourSelect.value = parts.hour;
    selectors.hourSelect.disabled = disabled;
    selectors.hourSelect.classList.toggle("isDisabled", disabled);
  }
  if (selectors.minuteSelect) {
    selectors.minuteSelect.value = parts.minute;
    selectors.minuteSelect.disabled = disabled;
    selectors.minuteSelect.classList.toggle("isDisabled", disabled);
  }
  if (selectors.meridiemSelect) {
    selectors.meridiemSelect.value = parts.meridiem;
    selectors.meridiemSelect.disabled = disabled;
    selectors.meridiemSelect.classList.toggle("isDisabled", disabled);
  }
}
