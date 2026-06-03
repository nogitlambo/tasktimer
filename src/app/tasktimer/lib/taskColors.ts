import type { Task } from "./types";

const buildTaskColorFamily = <
  TId extends string,
  TLabel extends string,
  TShades extends readonly string[],
  TAccents extends readonly string[] | undefined = undefined,
>(
  id: TId,
  label: TLabel,
  shades: TShades,
  accents?: TAccents
) => ({
  id,
  label,
  shades,
  accents: (accents || []) as TAccents extends readonly string[] ? TAccents : readonly [],
  allColors: [...shades, ...(accents || [])] as readonly string[],
});

export const TASK_COLOR_FAMILIES = [
  buildTaskColorFamily("red", "Red", ["#ffcdd2", "#ef9a9a", "#e57373", "#ef5350", "#f44336", "#e53935", "#d32f2f", "#c62828", "#b71c1c"], [
    "#ff8a80",
    "#ff5252",
    "#ff1744",
    "#d50000",
  ]),
  buildTaskColorFamily("pink", "Pink", ["#f8bbd0", "#f48fb1", "#f06292", "#ec407a", "#e91e63", "#d81b60", "#c2185b", "#ad1457", "#880e4f"], [
    "#ff80ab",
    "#ff4081",
    "#f50057",
    "#c51162",
  ]),
  buildTaskColorFamily("purple", "Purple", ["#e1bee7", "#ce93d8", "#ba68c8", "#ab47bc", "#9c27b0", "#8e24aa", "#7b1fa2", "#6a1b9a", "#4a148c"], [
    "#ea80fc",
    "#e040fb",
    "#d500f9",
    "#aa00ff",
  ]),
  buildTaskColorFamily("indigo", "Indigo", ["#c5cae9", "#9fa8da", "#7986cb", "#5c6bc0", "#3f51b5", "#3949ab", "#303f9f", "#283593", "#1a237e"], [
    "#8c9eff",
    "#536dfe",
    "#3d5afe",
    "#304ffe",
  ]),
  buildTaskColorFamily("blue", "Blue", ["#bbdefb", "#90caf9", "#64b5f6", "#42a5f5", "#2196f3", "#1e88e5", "#1976d2", "#1565c0", "#0d47a1"], [
    "#82b1ff",
    "#448aff",
    "#2979ff",
    "#2962ff",
  ]),
  buildTaskColorFamily("teal", "Teal", ["#b2dfdb", "#80cbc4", "#4db6ac", "#26a69a", "#009688", "#00897b", "#00796b", "#00695c", "#004d40"], [
    "#a7ffeb",
    "#64ffda",
    "#1de9b6",
    "#00bfa5",
  ]),
  buildTaskColorFamily("lime", "Lime", ["#f0f4c3", "#e6ee9c", "#dce775", "#d4e157", "#cddc39", "#c0ca33", "#afb42b", "#9e9d24", "#827717"], [
    "#f4ff81",
    "#eeff41",
    "#c6ff00",
    "#aeea00",
  ]),
  buildTaskColorFamily("yellow", "Yellow", ["#fff9c4", "#fff59d", "#fff176", "#ffee58", "#ffeb3b", "#fdd835", "#fbc02d", "#f9a825", "#f57f17"], [
    "#ffff8d",
    "#ffff00",
    "#ffea00",
    "#ffd600",
  ]),
  buildTaskColorFamily("orange", "Orange", ["#ffe0b2", "#ffcc80", "#ffb74d", "#ffa726", "#ff9800", "#fb8c00", "#f57c00", "#ef6c00", "#e65100"], [
    "#ffd180",
    "#ffab40",
    "#ff9100",
    "#ff6d00",
  ]),
  buildTaskColorFamily("brown", "Brown", ["#d7ccc8", "#bcaaa4", "#a1887f", "#8d6e63", "#795548", "#6d4c41", "#5d4037", "#4e342e", "#3e2723"]),
  buildTaskColorFamily("grey", "Grey", ["#f5f5f5", "#eeeeee", "#e0e0e0", "#bdbdbd", "#9e9e9e", "#757575", "#616161", "#424242", "#212121"]),
  buildTaskColorFamily("blue-grey", "Blue Grey", ["#cfd8dc", "#b0bec5", "#90a4ae", "#78909c", "#607d8b", "#546e7a", "#455a64", "#37474f", "#263238"]),
] as const;

export const TASK_COLOR_MAIN_SHADE_INDEX = 4;
export const TASK_COLOR_MAIN_SWATCHES_PER_ROW = 4;
export const TASK_COLOR_SHADE_SWATCHES_PER_ROW = 5;

export const TASK_COLOR_PALETTE = TASK_COLOR_FAMILIES.map((family) => family.shades[TASK_COLOR_MAIN_SHADE_INDEX]);

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/;

export function normalizeTaskColor(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return HEX_COLOR_RE.test(normalized) ? normalized : null;
}

export function getTaskColorFamilyForColor(color: string | null | undefined): (typeof TASK_COLOR_FAMILIES)[number] | null {
  const normalized = normalizeTaskColor(color);
  if (!normalized) return null;
  return TASK_COLOR_FAMILIES.find((family) => family.allColors.includes(normalized)) || null;
}

export function getNextAutoTaskColor(tasks: Array<Pick<Task, "color">>): string | null {
  const primaryPalette = TASK_COLOR_PALETTE.map((color) => normalizeTaskColor(color)).filter((color): color is string => !!color);
  const extendedPalette = TASK_COLOR_FAMILIES.flatMap((family) => family.allColors)
    .map((color) => normalizeTaskColor(color))
    .filter((color, index, list): color is string => !!color && list.indexOf(color) === index);
  const uniqueTaskColors = [...primaryPalette, ...extendedPalette.filter((color) => !primaryPalette.includes(color))];
  if (!uniqueTaskColors.length) return null;

  const paletteSet = new Set(uniqueTaskColors);
  const usedColors = new Set(
    tasks
      .map((task) => normalizeTaskColor(task.color))
      .filter((color): color is string => !!color && paletteSet.has(color))
  );

  return uniqueTaskColors.find((color) => !usedColors.has(color)) || uniqueTaskColors[0];
}

export function resolveNewTaskColor(options: {
  tasks: Array<Pick<Task, "color">>;
  selectedColor: string | null;
  selectedColorTouched: boolean;
}): string | null {
  if (options.selectedColorTouched) return normalizeTaskColor(options.selectedColor);
  return getNextAutoTaskColor(options.tasks);
}
