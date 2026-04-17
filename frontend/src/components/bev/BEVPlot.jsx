import { useEffect, useRef, useMemo } from 'react'
import Plotly from 'plotly.js-dist-min'
import { classColor } from '../../utils/colorScale'

const RING_RADII = [10, 20, 30, 40]
const RING_COLORS = ['#ef4444', '#f97316', '#84cc16', '#22c55e']

function makeRingTrace(r, color) {
  const theta = Array.from({ length: 361 }, (_, i) => (i * Math.PI) / 180)
  return {
    type: 'scatter',
    x: theta.map((t) => r * Math.sin(t)),
    y: theta.map((t) => r * Math.cos(t)),
    mode: 'lines',
    line: { color, width: 0.8, dash: 'dot' },
    hoverinfo: 'none',
    showlegend: false,
  }
}

function makeBoxFootprint(det) {
  const [cx, , cz, w, , l, yaw] = det.box_3d ?? []
  if (cx == null) return null
  const cos = Math.cos(yaw ?? 0)
  const sin = Math.sin(yaw ?? 0)
  const hw = (w ?? 2) / 2
  const hl = (l ?? 4) / 2
  const corners = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl], [-hw, -hl]]
  return {
    type: 'scatter',
    x: corners.map(([dx, dz]) => cx + dx * cos - dz * sin),
    y: corners.map(([dx, dz]) => cz + dx * sin + dz * cos),
    mode: 'lines',
    line: { color: classColor(det.class), width: 1.5 },
    hoverinfo: 'none',
    showlegend: false,
  }
}

const LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: '#020617',
  font: { color: '#94a3b8', family: 'monospace', size: 10 },
  xaxis: { title: 'X (m)', color: '#334155', gridcolor: '#1e293b', zerolinecolor: '#334155', scaleanchor: 'y' },
  yaxis: { title: 'Z (m)', color: '#334155', gridcolor: '#1e293b', zerolinecolor: '#334155' },
  margin: { l: 40, r: 10, t: 10, b: 40 },
  showlegend: false,
  hovermode: 'closest',
}

const CONFIG = { displayModeBar: false, responsive: true }

export default function BEVPlot({ detections, confidenceThreshold }) {
  const divRef = useRef()

  const filtered = useMemo(
    () => (detections ?? []).filter((d) => (d.confidence ?? 0) >= confidenceThreshold),
    [detections, confidenceThreshold]
  )

  const data = useMemo(() => {
    const traces = []

    RING_RADII.forEach((r, i) => traces.push(makeRingTrace(r, RING_COLORS[i])))

    traces.push({
      type: 'scatter', x: [0], y: [0], mode: 'markers',
      marker: { symbol: 'square', size: 10, color: '#3b82f6', line: { color: '#60a5fa', width: 1.5 } },
      name: 'Ego', hoverinfo: 'name',
    })

    filtered.forEach((det) => {
      const fp = makeBoxFootprint(det)
      if (fp) traces.push(fp)
    })

    const byClass = {}
    filtered.forEach((det) => {
      if (!byClass[det.class]) byClass[det.class] = { x: [], y: [], text: [], color: classColor(det.class) }
      const [cx, , cz] = det.xyz ?? [0, 0, 0]
      byClass[det.class].x.push(cx)
      byClass[det.class].y.push(cz)
      byClass[det.class].text.push(`${det.class} ${det.distance_m?.toFixed(1) ?? '?'}m`)
    })

    Object.entries(byClass).forEach(([, { x, y, text, color }]) => {
      traces.push({ type: 'scatter', x, y, mode: 'markers', marker: { color, size: 7, line: { color: '#000', width: 0.5 } }, text, hoverinfo: 'text' })
    })

    RING_RADII.forEach((r, i) => {
      traces.push({ type: 'scatter', x: [0], y: [r], mode: 'text', text: [`${r}m`], textfont: { color: RING_COLORS[i], size: 9 }, hoverinfo: 'none', showlegend: false })
    })

    return traces
  }, [filtered])

  useEffect(() => {
    if (!divRef.current) return
    Plotly.react(divRef.current, data, LAYOUT, CONFIG)
  }, [data])

  useEffect(() => {
    const el = divRef.current
    if (!el) return
    Plotly.newPlot(el, data, LAYOUT, CONFIG)
    const ro = new ResizeObserver(() => Plotly.Plots.resize(el))
    ro.observe(el)
    return () => { ro.disconnect(); Plotly.purge(el) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />
}
