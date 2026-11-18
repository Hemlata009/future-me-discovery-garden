// Shared chart colours (design tokens) and tooltip style.
export const CHART_PALETTE = [
  "var(--gd-navy)",
  "var(--gd-teal)",
  "var(--gd-indigo)",
  "var(--gd-mint)",
  "oklch(0.7 0.13 75)",
  "var(--muted-foreground)",
];

export const chartTooltip = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)",
    fontSize: 12,
  },
};
