import { describe, expect, it } from "vitest";
import { getNextAutoTaskColor, resolveNewTaskColor, TASK_COLOR_FAMILIES, TASK_COLOR_PALETTE } from "./taskColors";

describe("task color helpers", () => {
  it("returns the first palette color when no active tasks have colors", () => {
    expect(getNextAutoTaskColor([])).toBe(TASK_COLOR_PALETTE[0]);
  });

  it("skips colors already used by active tasks", () => {
    expect(
      getNextAutoTaskColor([
        { color: TASK_COLOR_PALETTE[0] },
        { color: TASK_COLOR_PALETTE[1] },
      ])
    ).toBe(TASK_COLOR_PALETTE[2]);
  });

  it("ignores invalid and non-primary task colors", () => {
    expect(
      getNextAutoTaskColor([
        { color: "not-a-color" },
        { color: "#123456" },
        { color: TASK_COLOR_PALETTE[0].toUpperCase() },
      ])
    ).toBe(TASK_COLOR_PALETTE[1]);
  });

  it("continues into the wider color catalog when all primary colors are already used", () => {
    const nextColor = getNextAutoTaskColor(TASK_COLOR_PALETTE.map((color) => ({ color })));
    expect(nextColor).toBe(TASK_COLOR_FAMILIES[0].shades[0]);
    expect(TASK_COLOR_PALETTE).not.toContain(nextColor);
  });

  it("only wraps once the full defined color catalog is exhausted", () => {
    const allDefinedColors = TASK_COLOR_FAMILIES.flatMap((family) => family.allColors);
    expect(getNextAutoTaskColor(allDefinedColors.map((color) => ({ color })))).toBe(TASK_COLOR_PALETTE[0]);
  });

  it("auto-assigns the next unused palette color when the user did not select one", () => {
    expect(
      resolveNewTaskColor({
        tasks: [{ color: TASK_COLOR_PALETTE[0] }],
        selectedColor: null,
        selectedColorTouched: false,
      })
    ).toBe(TASK_COLOR_PALETTE[1]);
  });

  it("keeps the computed auto-color even when the add-task UI preloads a preview color", () => {
    expect(
      resolveNewTaskColor({
        tasks: [{ color: TASK_COLOR_PALETTE[0] }],
        selectedColor: TASK_COLOR_PALETTE[1],
        selectedColorTouched: false,
      })
    ).toBe(TASK_COLOR_PALETTE[1]);
  });

  it("preserves an explicitly selected color", () => {
    expect(
      resolveNewTaskColor({
        tasks: [{ color: TASK_COLOR_PALETTE[0] }],
        selectedColor: TASK_COLOR_PALETTE[3],
        selectedColorTouched: true,
      })
    ).toBe(TASK_COLOR_PALETTE[3]);
  });

  it("preserves explicit no-color selection", () => {
    expect(
      resolveNewTaskColor({
        tasks: [{ color: TASK_COLOR_PALETTE[0] }],
        selectedColor: null,
        selectedColorTouched: true,
      })
    ).toBeNull();
  });
});
