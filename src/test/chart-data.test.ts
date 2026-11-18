import { describe, expect, it } from "vitest";

import { activityHeatmap, bestWindow, hourLabel, istSlot, peakLabel } from "@/lib/chart-data";

describe("activity heat map (IST)", () => {
  it("converts UTC to India time, Monday first", () => {
    // 2026-11-16 is a Monday. 13:30 UTC = 19:00 IST.
    expect(istSlot("2026-11-16T13:30:00Z")).toEqual({ day: 0, hour: 19 });
    // 20:00 UTC Sunday = 01:30 IST Monday.
    expect(istSlot("2026-11-15T20:00:00Z")).toEqual({ day: 0, hour: 1 });
  });

  it("counts each person once per hour slot and finds the peak", () => {
    const map = activityHeatmap([
      { who: "a", at: "2026-11-17T13:31:00Z" },
      { who: "a", at: "2026-11-17T13:50:00Z" }, // same person, same hour: counted once
      { who: "b", at: "2026-11-17T13:40:00Z" },
      { who: "c", at: "2026-11-18T04:00:00Z" },
      { who: "d", at: "not a date" },
    ]);
    expect(map.total).toBe(3);
    expect(map.cells[1]![19]).toBe(2); // Tuesday 7 pm IST
    expect(map.max).toBe(2);
    expect(peakLabel(map)).toBe("Tue 7 pm–8 pm IST");
  });

  it("finds the busiest 3-hour window", () => {
    const items = ["13", "14", "15", "14"].map((h, i) => ({
      who: `p${i}`,
      at: `2026-11-17T${h}:00:00Z`,
    }));
    const window = bestWindow(activityHeatmap(items));
    expect(window).toMatchObject({ share: 1 });
    expect(hourLabel(window!.from)).toBe("6 pm");
    expect(bestWindow(activityHeatmap([]))).toBeNull();
  });

  it("labels hours plainly", () => {
    expect(hourLabel(0)).toBe("12 am");
    expect(hourLabel(12)).toBe("12 pm");
    expect(hourLabel(19)).toBe("7 pm");
  });
});
