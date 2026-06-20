import { useEffect, useRef } from "react";
import { Chart, registerables, type ChartConfiguration } from "chart.js";
import { useTheme } from "../providers/theme";

Chart.register(...registerables);

const v = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const PALETTE = ["#14b8a6", "#6366f1", "#f59e0b", "#ec4899", "#22c55e", "#38bdf8", "#a78bfa", "#f97316"];

function useChart(build: () => ChartConfiguration, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);
  const { theme } = useTheme();
  useEffect(() => {
    if (!ref.current) return;
    chart.current?.destroy();
    chart.current = new Chart(ref.current, build());
    return () => { chart.current?.destroy(); chart.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, ...deps]);
  return ref;
}

function baseTooltip() {
  return {
    backgroundColor: v("--surface"), titleColor: v("--ink"), bodyColor: v("--ink-2"),
    borderColor: v("--line-strong"), borderWidth: 1, padding: 10, cornerRadius: 8,
    titleFont: { family: "JetBrains Mono", size: 11 }, bodyFont: { family: "JetBrains Mono", size: 12 }, displayColors: true,
  };
}

interface DonutProps { labels: string[]; values: number[]; currency?: string; }
export function DonutChart({ labels, values }: DonutProps) {
  const ref = useChart(() => ({
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: v("--surface"), borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "66%",
      plugins: {
        legend: { display: false },
        tooltip: { ...baseTooltip(), callbacks: { label: (c: any) => { const t = values.reduce((a, b) => a + b, 0); return ` ${c.label}: ${t ? ((c.parsed / t) * 100).toFixed(1) : 0}%`; } } },
      },
    },
  }), [JSON.stringify(labels), JSON.stringify(values)]);
  return <canvas ref={ref} />;
}

interface LineProps { labels: string[]; values: number[]; label?: string; color?: string; area?: boolean; }
export function LineChart({ labels, values, label = "Value", color, area = true }: LineProps) {
  const ref = useChart(() => {
    const c = color || v("--accent");
    return {
      type: "line",
      data: { labels, datasets: [{ label, data: values, borderColor: c, backgroundColor: area ? `${c}22` : "transparent", fill: area, tension: 0.32, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: c }] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: baseTooltip() },
        scales: {
          x: { grid: { display: false }, ticks: { color: v("--faint"), font: { family: "JetBrains Mono", size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
          y: { grid: { color: v("--line") }, ticks: { color: v("--faint"), font: { family: "JetBrains Mono", size: 10 } } },
        },
      },
    };
  }, [JSON.stringify(labels), JSON.stringify(values), label]);
  return <canvas ref={ref} />;
}

interface BarProps { labels: string[]; values: number[]; horizontal?: boolean; colorBySign?: boolean; }
export function BarChart({ labels, values, horizontal = false, colorBySign = false }: BarProps) {
  const ref = useChart(() => ({
    type: "bar",
    data: { labels, datasets: [{ data: values, borderRadius: 6, maxBarThickness: 30, backgroundColor: values.map((x, i) => colorBySign ? (x >= 0 ? v("--pos") : v("--neg")) : PALETTE[i % PALETTE.length]) }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x",
      plugins: { legend: { display: false }, tooltip: baseTooltip() },
      scales: {
        x: { grid: { display: !horizontal, color: v("--line") }, ticks: { color: v("--faint"), font: { family: "JetBrains Mono", size: 10 } } },
        y: { grid: { display: horizontal, color: v("--line") }, ticks: { color: v("--faint"), font: { family: "JetBrains Mono", size: 10 } } },
      },
    },
  }), [JSON.stringify(labels), JSON.stringify(values), horizontal, colorBySign]);
  return <canvas ref={ref} />;
}
