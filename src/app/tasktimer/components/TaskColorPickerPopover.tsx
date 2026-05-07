import type { CSSProperties } from "react";
import {
  TASK_COLOR_FAMILIES,
  TASK_COLOR_MAIN_SHADE_INDEX,
  TASK_COLOR_MAIN_SWATCHES_PER_ROW,
  TASK_COLOR_SHADE_SWATCHES_PER_ROW,
} from "../lib/taskColors";

type TaskColorPickerPopoverProps = {
  paletteId: string;
  noneId: string;
};

function getUniqueTaskColors(colors: readonly string[]) {
  return [...new Set(colors)];
}

export default function TaskColorPickerPopover({ paletteId, noneId }: TaskColorPickerPopoverProps) {
  return (
    <div className="taskColorPicker" id={paletteId} role="group" aria-label="Task color">
      <div className="taskColorPickerViewport">
        <div className="taskColorPickerScreen taskColorPickerScreenMain" data-task-color-screen="main">
          <div
            className="taskColorPickerFamilies taskColorPickerFamiliesMain"
            aria-label="Color families"
            style={{ "--task-color-columns": String(TASK_COLOR_MAIN_SWATCHES_PER_ROW) } as CSSProperties}
          >
            <button
              className="editTaskColorSwatch editTaskColorSwatchNone taskColorPickerMainSwatch isSelected"
              id={noneId}
              type="button"
              data-task-color=""
              title="No task color"
              aria-label="No task color"
            />
            {TASK_COLOR_FAMILIES.map((family, index) => (
              <button
                className={`taskColorPickerFamily taskColorPickerMainSwatch${index === 0 ? " isActive" : ""}`}
                key={family.id}
                type="button"
                data-task-color-family={family.id}
                data-task-color={family.shades[TASK_COLOR_MAIN_SHADE_INDEX]}
                role="tab"
                aria-selected={index === 0 ? "true" : "false"}
                aria-controls={`${paletteId}-${family.id}`}
                title={`${family.label} shades`}
                aria-label={`${family.label} shades`}
                style={{ "--task-color": family.shades[TASK_COLOR_MAIN_SHADE_INDEX] } as CSSProperties}
              />
            ))}
          </div>
        </div>
        <div className="taskColorPickerScreen taskColorPickerScreenShades" data-task-color-screen="shades">
          <div className="taskColorPickerShadeHeader">
            <button className="btn btn-ghost small taskColorPickerBackBtn" type="button" data-task-color-back="true" aria-label="Back to color families" title="Back to color families">
              <svg className="taskColorPickerBackIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M15.5 5.5L8.5 12l7 6.5" />
              </svg>
            </button>
          </div>
          <div className="taskColorPickerShadePanels">
            {TASK_COLOR_FAMILIES.map((family, index) => (
              <div
                className="taskColorPickerShades"
                key={family.id}
                id={`${paletteId}-${family.id}`}
                data-task-color-family-panel={family.id}
                role="tabpanel"
                aria-label={`${family.label} shades`}
                hidden={index !== 0}
                style={{ "--task-color-columns": String(TASK_COLOR_SHADE_SWATCHES_PER_ROW) } as CSSProperties}
              >
                {getUniqueTaskColors(family.allColors).map((color) => (
                  <button
                    className="editTaskColorSwatch taskColorPickerShade"
                    key={color}
                    type="button"
                    data-task-color={color}
                    data-task-color-family={family.id}
                    title={`Use task color ${color}`}
                    aria-label={`Use task color ${color}`}
                    style={{ "--task-color": color } as CSSProperties}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
