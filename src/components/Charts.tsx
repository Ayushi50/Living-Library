import { useMemo, type ReactNode } from 'react';
import { addDays, parseDay, toDay } from '../lib/dates';

/** Vertical bars with a visible numeric label; also exposes a data table for screen readers. */
export function BarChart({ data, label, unit = '' }: { data: { label: string; value: number }[]; label: string; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 560, H = 170, pad = 22, bw = (W - pad * 2) / data.length;
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H + 26}`} role="img" aria-label={`${label}: ${total}${unit}`} preserveAspectRatio="xMidYMid meet">
        <line x1={pad} x2={W - pad} y1={H} y2={H} className="ch-axis" />
        {data.map((d, i) => {
          const h = (d.value / max) * (H - 24);
          const x = pad + i * bw + bw * 0.18;
          return (
            <g key={d.label}>
              <rect x={x} y={H - h} width={bw * 0.64} height={Math.max(d.value ? 2 : 0, h)} rx={2} className="ch-bar"><title>{`${d.label}: ${d.value}${unit}`}</title></rect>
              {d.value > 0 && <text x={x + bw * 0.32} y={H - h - 5} textAnchor="middle" className="ch-val">{d.value}</text>}
              <text x={x + bw * 0.32} y={H + 16} textAnchor="middle" className="ch-lab">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {total === 0 && <figcaption className="ch-empty">Nothing recorded in this period.</figcaption>}
      <table className="visually-hidden"><caption>{label}</caption><tbody>{data.map((d) => <tr key={d.label}><th>{d.label}</th><td>{d.value}</td></tr>)}</tbody></table>
    </figure>
  );
}

export function HBars({ data, label, max: maxIn }: { data: { label: string; count: number }[]; label: string; max?: number }) {
  const max = maxIn ?? Math.max(1, ...data.map((d) => d.count));
  if (!data.length) return <p className="muted">Nothing to chart yet.</p>;
  return (
    <ul className="hbars" aria-label={label}>
      {data.map((d) => (
        <li key={d.label}><span className="hb-label">{d.label}</span><span className="hb-track"><span style={{ width: `${(d.count / max) * 100}%` }} /></span><span className="hb-n">{d.count}</span></li>
      ))}
    </ul>
  );
}

export function Ring({ pct, size = 84, children, label }: { pct: number; size?: number; children?: ReactNode; label: string }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${pct}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ring-text">{children ?? `${pct}%`}</span>
    </div>
  );
}

/** GitHub-style calendar of recorded days. Intensity is the count actually recorded; empty days stay empty. */
export function Heatmap({ year, counts, weekStartsOn = 1, label }: { year: number; counts: Map<string, number>; weekStartsOn?: 0 | 1; label: string }) {
  const { cols, months } = useMemo(() => {
    const first = `${year}-01-01`;
    const lead = (parseDay(first).getDay() - weekStartsOn + 7) % 7;
    const start = addDays(first, -lead);
    const cols: { day: string; inYear: boolean }[][] = [];
    for (let c = 0; c < 54; c++) {
      const col = [];
      for (let r = 0; r < 7; r++) {
        const day = addDays(start, c * 7 + r);
        col.push({ day, inYear: day.startsWith(String(year)) });
      }
      if (col.some((x) => x.inYear)) cols.push(col);
    }
    const months: { label: string; col: number }[] = [];
    cols.forEach((col, i) => {
      const d = col.find((x) => x.inYear && x.day.endsWith('-01') );
      if (d) months.push({ label: parseDay(d.day).toLocaleString('en', { month: 'short' }), col: i });
    });
    return { cols, months };
  }, [year, weekStartsOn]);
  const max = Math.max(1, ...counts.values());
  const level = (n: number) => (n <= 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const todayStr = toDay();
  const cell = 12, gap = 3;
  const total = [...counts.entries()].filter(([d]) => d.startsWith(String(year))).length;
  return (
    <figure className="chart heat">
      <div className="heat-scroll">
        <svg width={cols.length * (cell + gap) + 4} height={7 * (cell + gap) + 22} role="img" aria-label={`${label}: ${total} active days in ${year}`}>
          {months.map((m) => <text key={m.label + m.col} x={m.col * (cell + gap)} y={10} className="ch-lab">{m.label}</text>)}
          {cols.map((col, ci) => col.map((c, ri) => c.inYear && (
            <rect key={c.day} x={ci * (cell + gap)} y={18 + ri * (cell + gap)} width={cell} height={cell} rx={2} className={`hm hm-${level(counts.get(c.day) ?? 0)} ${c.day === todayStr ? 'is-today' : ''}`}>
              <title>{`${c.day}: ${counts.get(c.day) ?? 0} recorded`}</title>
            </rect>
          )))}
        </svg>
      </div>
      <figcaption className="heat-legend">Less {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`hm-sw hm-${l}`} />)} More · {total} active day{total === 1 ? '' : 's'}</figcaption>
    </figure>
  );
}
