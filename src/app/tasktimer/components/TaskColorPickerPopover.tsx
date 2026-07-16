import type { CSSProperties } from "react";
import {
  TASK_COLOR_FAMILIES,
  TASK_COLOR_MAIN_SHADE_INDEX,
  TASK_COLOR_MAIN_SWATCHES_PER_ROW,
} from "../lib/taskColors";

type TaskColorPickerPopoverProps = {
  paletteId: string;
  noneId: string;
};

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
                className={`editTaskColorSwatch taskColorPickerFamily taskColorPickerMainSwatch${index === 0 ? " isActive" : ""}`}
                key={family.id}
                type="button"
                data-task-color-family={family.id}
                data-task-color={family.shades[TASK_COLOR_MAIN_SHADE_INDEX]}
                title={`Use ${family.label} task color`}
                aria-label={`Use ${family.label} task color`}
                style={{ "--task-color": family.shades[TASK_COLOR_MAIN_SHADE_INDEX] } as CSSProperties}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
