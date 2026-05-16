import { describe, expect, it } from "vitest";
import { getTaskTimerTileColumnCount } from "./task-tile-columns";

function windowAtWidth(width: number): Pick<Window, "matchMedia"> {
  return {
    matchMedia: (query: string) => {
      const minWidthMatch = query.match(/min-width:\s*(\d+)px/);
      const minWidth = minWidthMatch ? Number(minWidthMatch[1]) : 0;
      return { matches: width >= minWidth } as MediaQueryList;
    },
  };
}

describe("getTaskTimerTileColumnCount", () => {
  it("uses responsive tile columns with a maximum of four", () => {
    expect(getTaskTimerTileColumnCount(windowAtWidth(719))).toBe(1);
    expect(getTaskTimerTileColumnCount(windowAtWidth(720))).toBe(2);
    expect(getTaskTimerTileColumnCount(windowAtWidth(1199))).toBe(2);
    expect(getTaskTimerTileColumnCount(windowAtWidth(1200))).toBe(3);
    expect(getTaskTimerTileColumnCount(windowAtWidth(1499))).toBe(3);
    expect(getTaskTimerTileColumnCount(windowAtWidth(1500))).toBe(4);
    expect(getTaskTimerTileColumnCount(windowAtWidth(3200))).toBe(4);
  });

  it("falls back to one column when matchMedia is unavailable", () => {
    expect(getTaskTimerTileColumnCount(null)).toBe(1);
    expect(getTaskTimerTileColumnCount({} as Pick<Window, "matchMedia">)).toBe(1);
  });
});
