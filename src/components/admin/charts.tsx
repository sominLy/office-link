import { ReactNode, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { fmt, INK, longDay, Marker, SERIES, SeriesDef, shortDay } from './format';

/** 카드 + 제목 + (선택) 표로 보기 */
export function ChartCard({
  title, subtitle, children, table, actions, className,
}: { title: string; subtitle?: ReactNode; children: ReactNode; table?: ReactNode; actions?: ReactNode; className?: string }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cn('min-w-0 rounded-xl border border-black/10 bg-[#fcfcfb] p-4', className)}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#0b0b0b]">{title}</h3>
          {subtitle && <p className="text-xs text-[#52514e] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {actions}
          {table && (
            <button
              type="button"
              onClick={() => setAsTable(v => !v)}
              className="text-[11px] text-[#52514e] border border-black/10 rounded-md px-2 py-1 hover:bg-black/[0.03]"
              aria-pressed={asTable}
            >
              {asTable ? '차트로 보기' : '표로 보기'}
            </button>
          )}
        </div>
      </div>
      {asTable && table ? <div className="max-h-80 overflow-auto">{table}</div> : children}
    </section>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2" aria-hidden>
      {items.map(i => (
        <span key={i.name} className="inline-flex items-center gap-1.5 text-xs text-[#52514e]">
          <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

function TooltipBox({ title, rows, notes }: { title: string; rows: { name: string; value: string; color?: string }[]; notes?: string[] }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 shadow-md text-xs min-w-[8rem]">
      <p className="text-[#52514e] mb-1">{title}</p>
      {rows.map(r => (
        <p key={r.name} className="flex items-center gap-2 leading-5">
          {r.color && <span className="inline-block w-3 h-0.5 rounded-full flex-shrink-0" style={{ background: r.color }} />}
          <b className="text-[#0b0b0b] tabular-nums">{r.value}</b>
          <span className="text-[#52514e]">{r.name}</span>
        </p>
      ))}
      {notes?.map(n => <p key={n} className="mt-1 text-[#52514e] max-w-[14rem] [word-break:keep-all]">{n}</p>)}
    </div>
  );
}

const markerGlyph = (m: Marker) => (m.kind === 'release' ? '🚀' : '📌');

/** 일별 추이 — 여러 줄은 한 축(같은 단위)에서만. 업데이트·메모는 세로 선으로 */
export function TrendChart<T extends { day: string }>({
  data, series, markers = [], height = 220,
}: { data: T[]; series: SeriesDef[]; markers?: Marker[]; height?: number }) {
  const byDay = new Map<string, Marker[]>();
  markers.forEach(m => byDay.set(m.day, [...(byDay.get(m.day) || []), m]));
  const days = new Set(data.map(d => d.day));
  // 날이 많으면(90일·전체) 아이콘이 겹쳐서 선만 긋고, 내용은 툴팁·표에서
  const showGlyphs = data.length <= 45;
  return (
    <>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ name: s.name, color: SERIES[i] }))} />}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={INK.grid} strokeWidth={1} />
            <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: INK.muted, fontSize: 11 }} axisLine={{ stroke: INK.axis }} tickLine={false} minTickGap={18} />
            <YAxis allowDecimals={false} tick={{ fill: INK.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={v => fmt(v)} />
            {[...byDay.entries()].filter(([day]) => days.has(day)).map(([day, ms]) => (
              <ReferenceLine key={day} x={day} stroke={INK.axis} strokeWidth={1}
                label={showGlyphs ? { value: ms.map(markerGlyph).join(''), position: 'top', fontSize: 11 } : undefined} />
            ))}
            <Tooltip
              cursor={{ stroke: INK.muted, strokeWidth: 1 }}
              content={({ active, label, payload }) => {
                if (!active || !payload?.length) return null;
                const day = String(label);
                return (
                  <TooltipBox
                    title={longDay(day)}
                    rows={series.map((s, i) => {
                      const p = payload.find(x => x.dataKey === s.key);
                      return { name: s.name, value: `${fmt(Number(p?.value ?? 0), 1)}${s.unit || ''}`, color: SERIES[i] };
                    })}
                    notes={(byDay.get(day) || []).map(m => `${markerGlyph(m)} ${m.label}`)}
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={SERIES[i]} strokeWidth={2}
                dot={false} activeDot={{ r: 4, stroke: INK.surface, strokeWidth: 2 }} isAnimationActive={false}
                strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** 세로 막대 (한 계열) — 주별·시간대별 */
export function ColumnChart<T extends Record<string, unknown>>({
  data, xKey, yKey, name, unit = '', xFormat, height = 200, highlight,
}: { data: T[]; xKey: keyof T & string; yKey: keyof T & string; name: string; unit?: string; xFormat?: (v: string) => string; height?: number; highlight?: (row: T) => boolean }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} strokeWidth={1} />
          <XAxis dataKey={xKey} tickFormatter={v => (xFormat ? xFormat(String(v)) : String(v))} tick={{ fill: INK.muted, fontSize: 11 }} axisLine={{ stroke: INK.axis }} tickLine={false} minTickGap={8} />
          <YAxis allowDecimals={false} tick={{ fill: INK.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={v => fmt(v)} />
          <Tooltip
            cursor={{ fill: 'rgba(11,11,11,0.04)' }}
            content={({ active, label, payload }) => {
              if (!active || !payload?.length) return null;
              return <TooltipBox title={xFormat ? xFormat(String(label)) : String(label)} rows={[{ name, value: `${fmt(Number(payload[0].value))}${unit}`, color: SERIES[0] }]} />;
            }}
          />
          <Bar dataKey={yKey} name={name} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}
            shape={(props: unknown) => {
              const p = props as { x: number; y: number; width: number; height: number; payload: T };
              if (!p.height || p.height <= 0) return <g />;
              const r = Math.min(4, p.width / 2, p.height);
              const fill = highlight && !highlight(p.payload) ? '#9ec5f4' : SERIES[0];
              const { x, y, width: w, height: h } = p;
              return <path d={`M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`} fill={fill} />;
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 가로 막대 목록 — 항목 이름이 길 때. 값은 막대 오른쪽 칸에 (잘리지 않게 자리를 따로 둔다) */
export function BarList({
  rows, max, color = SERIES[0], valueLabel,
}: { rows: { label: string; value: number; sub?: string }[]; max?: number; color?: string; valueLabel?: (v: number) => string }) {
  const top = max ?? Math.max(1, ...rows.map(r => r.value));
  if (rows.length === 0) return <p className="text-xs text-[#898781] py-4 text-center">아직 기록이 없어요</p>;
  return (
    <ul className="space-y-2">
      {rows.map(r => (
        <li key={r.label} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] sm:grid-cols-[8rem_minmax(0,1fr)_auto] items-center gap-2" title={r.sub ? `${r.label}: ${r.sub}` : r.label}>
          <span className="text-xs text-[#52514e] leading-tight [word-break:keep-all] break-words">{r.label}</span>
          <span className="h-3 block">
            <span className="h-3 block rounded-r-[4px]" style={{ width: `${r.value > 0 ? Math.max(2, (r.value / top) * 100) : 0}%`, background: color }} />
          </span>
          <span className="text-xs text-[#0b0b0b] tabular-nums whitespace-nowrap text-right">
            {valueLabel ? valueLabel(r.value) : fmt(r.value)}
            {r.sub && <span className="text-[#898781]"> · {r.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 표 */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number | ReactNode)[][] }) {
  return (
    <table className="w-full text-xs [word-break:keep-all]">
      <thead className="sticky top-0 bg-[#fcfcfb]">
        <tr className="border-b border-black/10">
          {head.map((h, i) => <th key={h} className={cn('py-1.5 px-1 font-medium text-[#52514e] whitespace-nowrap', i === 0 ? 'text-left' : 'text-right')}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-black/5 last:border-0">
            {r.map((c, ci) => <td key={ci} className={cn('py-1.5 px-1 tabular-nums text-[#0b0b0b]', ci === 0 ? 'text-left min-w-[5.5rem]' : 'text-right whitespace-nowrap')}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
