interface LineChartProps {
  values: number[];
  height?: number;
  color?: string;
  unit?: string;
}

/** Lightweight responsive line+area chart (hand-drawn SVG, no chart lib). */
export function LineChart({ values, height = 170, color = "var(--gold)", unit = "" }: LineChartProps) {
  const W = 640;
  const H = height;
  const pad = 28;

  if (values.length < 2) {
    return (
      <div className="grid h-[170px] place-items-center text-sm text-faint">
        Play a few hands to see your trend.
      </div>
    );
  }

  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(values.length - 1).toFixed(1)} ${y(min).toFixed(1)} L ${x(0).toFixed(1)} ${y(min).toFixed(1)} Z`;
  const zeroY = y(0);
  const last = values[values.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 4" />
      <path d={area} fill="url(#areaFill)" />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={4} fill={color} />
      <text x={pad} y={16} fill="var(--text-faint)" fontSize="11">
        {max.toFixed(0)}{unit}
      </text>
      <text x={pad} y={H - 6} fill="var(--text-faint)" fontSize="11">
        {min.toFixed(0)}{unit}
      </text>
    </svg>
  );
}

export function MiniBars({ values, color = "var(--info)" }: { values: number[]; color?: string }) {
  if (values.length === 0) {
    return <div className="grid h-[120px] place-items-center text-sm text-faint">No reads logged yet.</div>;
  }
  const recent = values.slice(-30);
  return (
    <div className="flex h-[120px] items-end gap-1">
      {recent.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm"
          style={{ height: `${Math.max(3, v * 100)}%`, background: color, opacity: 0.55 + v * 0.45 }}
          title={`${Math.round(v * 100)}%`}
        />
      ))}
    </div>
  );
}
