import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipProps,
  type LegendProps,
} from "recharts";
import { Activity } from "lucide-react";
import { COLORS, getChartColors, type Theme } from "../colors";
import type { TimelinePoint } from "../types";

interface HorizonChartProps {
  data: TimelinePoint[];
  noteBanner: string;
  theme: Theme;
}

function formatAxisDate(dateStr: string, spanDays: number): string {
  const d = new Date(dateStr);
  if (spanDays > 450) {
    return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatTooltipDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/95 px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur-sm">
      <div className="mb-2 text-[11px] tracking-wide text-zinc-500">
        {formatTooltipDate(label)}
      </div>
      <div className="flex flex-col gap-1.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-8">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </span>
            <span className="tabular-nums font-semibold text-zinc-100">
              ₹
              {Number(p.value).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomLegend({ payload }: LegendProps) {
  if (!payload) return null;
  return (
    <div className="mb-1 flex items-center justify-end gap-5 pr-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
      {payload.map((entry) => {
        const dashed = entry.dataKey === "nifty";
        return (
          <span key={entry.dataKey as string} className="flex items-center gap-1.5">
            {dashed ? (
              <svg width="16" height="3" className="shrink-0">
                <line
                  x1="0" y1="1.5" x2="16" y2="1.5"
                  stroke={entry.color}
                  strokeWidth="1.75"
                  strokeDasharray="4 3"
                />
              </svg>
            ) : (
              <span className="h-[2.5px] w-4 rounded-full" style={{ backgroundColor: entry.color }} />
            )}
            {entry.value}
          </span>
        );
      })}
    </div>
  );
}

export default function HorizonChart({ data, noteBanner, theme }: HorizonChartProps) {
  const spanDays = useMemo(() => {
    if (data.length < 2) return 0;
    const first = new Date(data[0].date).getTime();
    const last = new Date(data[data.length - 1].date).getTime();
    return (last - first) / (1000 * 60 * 60 * 24);
  }, [data]);

  const chartColors = getChartColors(theme);

  return (
    <div>
      <div className="mb-4 rounded-xl border border-zinc-800 border-l-2 border-l-emerald-500 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
        {noteBanner}
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-lg shadow-black/20">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <Activity className="h-4 w-4 text-emerald-400" strokeWidth={2.25} />
          </span>
          <div>
            <div className="text-sm font-semibold text-zinc-100">Performance Chart</div>
            <div className="text-[11px] text-zinc-500">Custom Portfolio vs. Nifty 50, normalized</div>
          </div>
        </div>
        <div className="h-[440px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.emerald500} stopOpacity={0.28} />
                <stop offset="100%" stopColor={COLORS.emerald500} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartColors.grid}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: chartColors.axisText, fontSize: 11, fontFamily: "Manrope, system-ui, sans-serif" }}
              tickLine={false}
              axisLine={{ stroke: chartColors.axisLine }}
              tickFormatter={(v: string) => formatAxisDate(v, spanDays)}
              minTickGap={56}
              padding={{ left: 8, right: 8 }}
            />
            <YAxis
              tick={{ fill: chartColors.axisText, fontSize: 11, fontFamily: "Manrope, system-ui, sans-serif" }}
              tickLine={false}
              axisLine={false}
              width={82}
              domain={[(min: number) => min * 0.985, (max: number) => max * 1.015]}
              tickFormatter={(v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: chartColors.axisText, strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            <Legend content={<CustomLegend />} verticalAlign="top" align="right" height={28} />
            <Area
              type="monotone"
              dataKey="nifty"
              name="Nifty 50 Index"
              stroke={COLORS.slate400}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="transparent"
              dot={false}
              activeDot={{ r: 3.5, fill: COLORS.slate400, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="portfolio"
              name="Custom Portfolio"
              stroke={COLORS.emerald500}
              strokeWidth={2.5}
              fill="url(#portfolioFill)"
              dot={false}
              activeDot={{ r: 4, fill: COLORS.emerald500, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
