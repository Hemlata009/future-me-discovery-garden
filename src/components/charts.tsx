import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { bestWindow, hourLabel, peakLabel, WEEKDAYS, type Heatmap } from "@/lib/chart-data";
import { CHART_PALETTE, chartTooltip } from "@/lib/chart-theme";

/** Donut with a centre total and a legend that also shows each share. */
export function DonutChart({
  items,
  label,
  unit,
  size = 180,
}: {
  items: { name: string; value: number; color?: string | undefined }[];
  label: string;
  unit: string;
  size?: number;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const coloured = items.map((item, index) => ({
    ...item,
    color: item.color ?? CHART_PALETTE[index % CHART_PALETTE.length]!,
  }));
  const shown = coloured.filter((item) => item.value > 0);
  return (
    <div
      className="chart-donut"
      role="img"
      aria-label={`${label}: ${coloured.map((i) => `${i.name} ${i.value}`).join(", ")}`}
    >
      <div className="chart-donut-ring" style={{ width: size, height: size }}>
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={shown}
                dataKey="value"
                nameKey="name"
                innerRadius="62%"
                outerRadius="94%"
                paddingAngle={shown.length > 1 ? 2 : 0}
                stroke="none"
              >
                {shown.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip {...chartTooltip} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <span className="chart-donut-empty" />
        )}
        <span className="chart-donut-total">
          <strong>{total.toLocaleString("en-US")}</strong>
          <small>{unit}</small>
        </span>
      </div>
      <ul className="chart-legend">
        {coloured.map((item) => (
          <li key={item.name}>
            <i style={{ background: item.color }} />
            <span>{item.name}</span>
            <strong>{item.value.toLocaleString("en-US")}</strong>
            <small>{total ? `${Math.round((item.value / total) * 100)}%` : "—"}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

/** Day × hour heat map (IST). Each cell's shade is its share of the busiest cell. */
export function HeatmapChart({ map, unit }: { map: Heatmap; unit: string }) {
  const window = bestWindow(map);
  const peak = peakLabel(map);
  if (!map.total) return <p className="gd-muted">No activity in this period yet.</p>;
  return (
    <div className="heatmap">
      <div className="heatmap-summary">
        {window && (
          <p>
            <strong>
              Best time: {hourLabel(window.from)}–{hourLabel(window.to)} IST
            </strong>{" "}
            · {Math.round(window.share * 100)}% of {unit}
          </p>
        )}
        {peak && <p className="gd-muted">Busiest hour: {peak}</p>}
      </div>
      <div className="heatmap-scroll">
        <table className="heatmap-grid" aria-label={`Activity by day and hour (IST). ${unit}.`}>
          <thead>
            <tr>
              <th />
              {Array.from({ length: 24 }, (_, hour) => (
                <th key={hour} scope="col">
                  {HOUR_TICKS.includes(hour) ? hourLabel(hour).replace(" ", "") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {map.cells.map((row, day) => (
              <tr key={WEEKDAYS[day]}>
                <th scope="row">{WEEKDAYS[day]}</th>
                {row.map((value, hour) => {
                  const level = map.max ? value / map.max : 0;
                  return (
                    <td
                      key={hour}
                      title={`${WEEKDAYS[day]} ${hourLabel(hour)} IST: ${value} ${unit}`}
                      style={{
                        background:
                          value === 0
                            ? "var(--secondary)"
                            : `color-mix(in oklab, var(--gd-teal) ${Math.round(18 + level * 82)}%, var(--card))`,
                      }}
                    >
                      <span className="sr-only">{value}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="heatmap-legend" aria-hidden="true">
        <span>Less</span>
        {[0.15, 0.4, 0.65, 0.9, 1].map((level) => (
          <i
            key={level}
            style={{
              background: `color-mix(in oklab, var(--gd-teal) ${Math.round(18 + level * 82)}%, var(--card))`,
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
