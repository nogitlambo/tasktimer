import { describe, expect, it } from "vitest";
import { formatMainTaskElapsed, formatMainTaskElapsedHtml } from "./tasks";

function compactHtml(value: string) {
  return value.replace(/\s+/g, " ");
}

describe("main task elapsed formatting", () => {
  it("formats zero elapsed time as hours, minutes, and seconds only", () => {
    const html = compactHtml(formatMainTaskElapsedHtml(0));

    expect(formatMainTaskElapsed(0)).toBe("00 00 00");
    expect(html).toContain('<span class="timeBoxUnit">H</span>');
    expect(html).toContain('<span class="timeBoxUnit">M</span>');
    expect(html).toContain('<span class="timeBoxUnit">S</span>');
    expect(html).not.toContain('<span class="timeBoxUnit">D</span>');
  });

  it("renders hours, minutes, and seconds in the task-card timer html", () => {
    const elapsedMs = ((1 * 60 * 60) + (2 * 60) + 3) * 1000;
    const html = compactHtml(formatMainTaskElapsedHtml(elapsedMs, true));

    expect(formatMainTaskElapsed(elapsedMs)).toBe("01 02 03");
    expect(html).toContain('<span class="timeBoxNum">01</span><span class="timeBoxUnit">H</span>');
    expect(html).toContain('<span class="timeBoxNum">02</span><span class="timeBoxUnit">M</span>');
    expect(html).toContain('<span class="timeBoxNum">03</span><span class="timeBoxUnit">S</span>');
    expect(html).not.toContain('<span class="timeBoxUnit">D</span>');
  });

  it("uses total hours for elapsed times over 24 hours", () => {
    const elapsedMs = 26 * 60 * 60 * 1000;
    const html = compactHtml(formatMainTaskElapsedHtml(elapsedMs));

    expect(formatMainTaskElapsed(elapsedMs)).toBe("26 00 00");
    expect(html).toContain('<span class="timeBoxNum">26</span><span class="timeBoxUnit">H</span>');
    expect(html).toContain('<span class="timeBoxNum">00</span><span class="timeBoxUnit">M</span>');
    expect(html).toContain('<span class="timeBoxNum">00</span><span class="timeBoxUnit">S</span>');
    expect(html).not.toContain('<span class="timeBoxUnit">D</span>');
  });
});
