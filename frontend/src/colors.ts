// Hex values mirroring the Tailwind classes used elsewhere in the UI.
// Recharts/SVG props need real color values, not utility class names, so
// chart-facing colors that must flip between themes live here rather than
// as Tailwind classes (which are handled via the [data-theme="light"] CSS
// overrides in index.css instead).
export const COLORS = {
  emerald500: "#10b981",
  rose500: "#f43f5e",
  amber500: "#f59e0b",
  slate400: "#94a3b8",
  zinc700: "#3f3f46",
  zinc800: "#27272a",
  zinc500: "#71717a",
  zinc300: "#d4d4d8",
};

export type Theme = "dark" | "light";

export function getChartColors(theme: Theme) {
  if (theme === "light") {
    return {
      grid: "rgba(15,23,42,0.08)",
      axisText: "#64748b",
      axisLine: "#cbd5e1",
    };
  }
  return {
    grid: "rgba(255,255,255,0.06)",
    axisText: COLORS.zinc500,
    axisLine: COLORS.zinc800,
  };
}
