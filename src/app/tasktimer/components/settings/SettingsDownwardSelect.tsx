"use client";

import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement, ReactNode, SelectHTMLAttributes } from "react";

type SettingsDownwardSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
};

function optionText(children: ReactNode) {
  return Children.toArray(children).join("");
}

function isOptionElement(child: ReactNode): child is ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }> {
  return isValidElement(child) && child.type === "option";
}

export function SettingsDownwardSelect({ children, className, disabled, onChange, ...props }: SettingsDownwardSelectProps) {
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => String(props.value ?? props.defaultValue ?? ""));
  const [selectDisabled, setSelectDisabled] = useState(Boolean(disabled));

  const options = useMemo<SelectOption[]>(
    () =>
      Children.toArray(children)
        .filter(isOptionElement)
        .map((child) => ({
          value: String(child.props.value ?? optionText(child.props.children)),
          label: optionText(child.props.children),
          disabled: Boolean(child.props.disabled),
        })),
    [children],
  );

  const currentValue = props.value !== undefined ? String(props.value) : value;
  const selectedOption = options.find((option) => option.value === currentValue) ?? options[0];

  function syncFromSelect() {
    const select = selectRef.current;
    if (!select) return;
    setValue(select.value);
    setSelectDisabled(select.disabled);
  }

  function closeMenu() {
    setOpen(false);
  }

  function chooseOption(nextValue: string) {
    const select = selectRef.current;
    if (!select) return;

    select.value = nextValue;
    setValue(nextValue);
    setOpen(false);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function moveSelection(direction: 1 | -1) {
    const enabledOptions = options.filter((option) => !option.disabled);
    if (!enabledOptions.length) return;

    const currentEnabledIndex = enabledOptions.findIndex((option) => option.value === currentValue);
    const fallbackIndex = direction > 0 ? -1 : 0;
    const nextIndex = (currentEnabledIndex === -1 ? fallbackIndex : currentEnabledIndex) + direction;
    const wrappedIndex = (nextIndex + enabledOptions.length) % enabledOptions.length;
    setValue(enabledOptions[wrappedIndex].value);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (selectDisabled) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && selectedOption && !selectedOption.disabled) {
        chooseOption(selectedOption.value);
        return;
      }
      syncFromSelect();
      setOpen(true);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        syncFromSelect();
        setOpen(true);
        return;
      }
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      syncFromSelect();
      setOpen(false);
    }
  }

  useEffect(() => {
    syncFromSelect();

    const select = selectRef.current;
    if (!select) return;

    const observer = new MutationObserver(syncFromSelect);
    observer.observe(select, { attributes: true, attributeFilter: ["disabled"] });

    const intervalId = window.setInterval(() => {
      syncFromSelect();
    }, 250);

    return () => {
      observer.disconnect();
      window.clearInterval(intervalId);
    };
  }, []);

  const wrapperClassName = className ? `settingsDownwardSelect ${className}` : "settingsDownwardSelect";

  return (
    <span className={wrapperClassName} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        closeMenu();
        syncFromSelect();
      }
    }}>
      <select
        {...props}
        ref={selectRef}
        className="settingsDownwardNativeSelect"
        disabled={disabled}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          setSelectDisabled(event.currentTarget.disabled);
          onChange?.(event);
        }}
        tabIndex={-1}
        aria-hidden="true"
      >
        {children}
      </select>
      <button
        className="settingsDownwardSelectTrigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={selectDisabled}
        onClick={() => {
          syncFromSelect();
          setOpen((nextOpen) => !nextOpen);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedOption?.label ?? ""}</span>
      </button>
      {open ? (
        <div className="settingsDownwardSelectMenu" role="listbox">
          {options.map((option, index) => (
            <button
              className={option.value === currentValue ? "settingsDownwardSelectOption isSelected" : "settingsDownwardSelectOption"}
              disabled={option.disabled}
              key={`${option.value}-${index}`}
              role="option"
              type="button"
              aria-selected={option.value === currentValue}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseOption(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
