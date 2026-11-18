// Browser-safe chart helpers. Heat maps use India Standard Time (UTC+5:30) because
// students, families and counsellors are in India; the label says so everywhere.

export const IST_OFFSET_MINUTES = 330;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type Heatmap = {
  /** cells[day][hour], Monday = 0, hours 0–23 in IST. */
  cells: number[][];
  max: number;
  total: number;
  peak: { day: number; hour: number; value: number } | null;
};

export function emptyHeatmap(): Heatmap {
  return {
    cells: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
    max: 0,
    total: 0,
    peak: null,
  };
}

/** Day/hour slot in IST for a UTC timestamp. */
export function istSlot(iso: string, offsetMinutes = IST_OFFSET_MINUTES) {
  const local = new Date(Date.parse(iso) + offsetMinutes * 60_000);
  return { day: (local.getUTCDay() + 6) % 7, hour: local.getUTCHours() };
}

/**
 * Counts each person at most once per day-and-hour slot (key = who + date + hour),
 * so one busy session can't paint the whole map.
 */
export function activityHeatmap(
  items: { who: string; at: string }[],
  offsetMinutes = IST_OFFSET_MINUTES,
): Heatmap {
  const map = emptyHeatmap();
  const seen = new Set<string>();
  for (const item of items) {
    const time = Date.parse(item.at);
    if (!Number.isFinite(time)) continue;
    const local = new Date(time + offsetMinutes * 60_000);
    const key = `${item.who}|${local.toISOString().slice(0, 13)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { day, hour } = istSlot(item.at, offsetMinutes);
    map.cells[day]![hour]! += 1;
  }
  return finish(map);
}

export function finish(map: Heatmap): Heatmap {
  let max = 0;
  let total = 0;
  let peak: Heatmap["peak"] = null;
  map.cells.forEach((row, day) =>
    row.forEach((value, hour) => {
      total += value;
      if (value > max) {
        max = value;
        peak = { day, hour, value };
      }
    }),
  );
  return { ...map, max, total, peak };
}

export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "am" : "pm"}`;
}

export function peakLabel(map: Heatmap): string | null {
  if (!map.peak) return null;
  return `${WEEKDAYS[map.peak.day]} ${hourLabel(map.peak.hour)}–${hourLabel((map.peak.hour + 1) % 24)} IST`;
}

/** Busiest 3-hour window across the week, for a plain-language "best time to call". */
export function bestWindow(map: Heatmap): { from: number; to: number; share: number } | null {
  if (!map.total) return null;
  const byHour = Array.from({ length: 24 }, (_, hour) =>
    map.cells.reduce((sum, row) => sum + row[hour]!, 0),
  );
  let best = 0;
  let bestSum = -1;
  for (let start = 0; start < 24; start += 1) {
    const sum = byHour[start]! + byHour[(start + 1) % 24]! + byHour[(start + 2) % 24]!;
    if (sum > bestSum) {
      bestSum = sum;
      best = start;
    }
  }
  return { from: best, to: (best + 3) % 24, share: bestSum / map.total };
}
