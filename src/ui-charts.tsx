import { useState } from 'react'
import type { Point } from './lib/analytics'

const W = 320
const H = 120
const PAD = { l: 4, r: 4, t: 10, b: 16 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

interface ChartProps {
  data: Point[]
  unit?: string
  /** fixed y-max (e.g. 10 for mood); otherwise auto */
  max?: number
  /** round decimals in the readout */
  dp?: number
}

/** Single-series bar chart (green), recessive grid, hover readout. */
export function Bars({ data, unit = '', max, dp = 0 }: ChartProps) {
  const [hi, setHi] = useState<number | null>(null)
  if (!data.length) return <div className="chart-empty">no data</div>
  const top = max ?? niceMax(Math.max(...data.map((d) => d.value), 1))
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const bw = iw / data.length
  const barW = Math.max(2, Math.min(18, bw * 0.6))
  const x = (i: number) => PAD.l + i * bw + (bw - barW) / 2
  const y = (v: number) => PAD.t + ih * (1 - v / top)
  const active = hi != null ? data[hi] : null

  return (
    <div className="chart">
      <div className="chart-readout">{active ? `${active.label}: ${active.value.toFixed(dp)} ${unit}` : `peak ${top} ${unit}`}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => setHi(null)}>
        {[0.5, 1].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={y(top * f)} y2={y(top * f)} className="grid" />
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} className="axis" />
        {data.map((d, i) => (
          <g key={i} onMouseEnter={() => setHi(i)}>
            {/* invisible full-height hit target */}
            <rect x={PAD.l + i * bw} y={PAD.t} width={bw} height={ih} fill="transparent" />
            <rect
              className={`bar${hi === i ? ' on' : ''}`}
              x={x(i)}
              y={y(d.value)}
              width={barW}
              height={Math.max(0, PAD.t + ih - y(d.value))}
              rx={2}
            >
              <title>{`${d.label}: ${d.value.toFixed(dp)} ${unit}`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <div className="chart-xlabels">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  )
}

/** Single-series line chart (green) with points and hover readout. */
export function Line({ data, unit = '', max, dp = 1 }: ChartProps) {
  const [hi, setHi] = useState<number | null>(null)
  if (data.length < 2) return <div className="chart-empty">need more data</div>
  const vals = data.map((d) => d.value)
  const lo = Math.min(...vals)
  const hiV = max ?? Math.max(...vals)
  const span = hiV - lo || 1
  const pad = span * 0.1
  const top = hiV + pad
  const bot = lo - pad
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (iw * i) / (data.length - 1)
  const y = (v: number) => PAD.t + ih * (1 - (v - bot) / (top - bot))
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const active = hi != null ? data[hi] : null

  return (
    <div className="chart">
      <div className="chart-readout">
        {active ? `${active.label}: ${active.value.toFixed(dp)} ${unit}` : `${lo.toFixed(dp)}–${hiV.toFixed(dp)} ${unit}`}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => setHi(null)}>
        <polyline className="line" points={pts} fill="none" />
        {data.map((d, i) => (
          <g key={i} onMouseEnter={() => setHi(i)}>
            <rect x={x(i) - iw / data.length / 2} y={PAD.t} width={iw / data.length} height={ih} fill="transparent" />
            <circle className={`dot${hi === i ? ' on' : ''}`} cx={x(i)} cy={y(d.value)} r={hi === i ? 3.5 : 2}>
              <title>{`${d.label}: ${d.value.toFixed(dp)} ${unit}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="chart-xlabels">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  )
}

/** Two labelled bars for a simple A-vs-B comparison (e.g. mood on/off training). */
export function Compare({ a, b, max = 10, unit = '' }: { a: { label: string; value: number }; b: { label: string; value: number }; max?: number; unit?: string }) {
  const row = (d: { label: string; value: number }, cls: string) => (
    <div className="cmp-row">
      <span className="cmp-label">{d.label}</span>
      <div className="cmp-track">
        <div className={`cmp-fill ${cls}`} style={{ width: `${(d.value / max) * 100}%` }} />
      </div>
      <span className="cmp-val">{d.value.toFixed(1)} {unit}</span>
    </div>
  )
  return (
    <div className="cmp">
      {row(a, 'up')}
      {row(b, 'dim')}
    </div>
  )
}
