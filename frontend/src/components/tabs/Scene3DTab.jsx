import { useEffect, useRef } from 'react'
import useAppStore from '../../store/appStore'

const BOX_COLORS = {
  car:        'lime',
  pedestrian: 'cyan',
  cyclist:    'yellow',
  truck:      'orange',
}

const BOX_EDGES = [
  [0,1],[1,2],[2,3],[3,0],
  [4,5],[5,6],[6,7],[7,4],
  [0,4],[1,5],[2,6],[3,7],
]

function buildBoxTraces(detections) {
  const traces = []
  for (const det of detections) {
    if (!det.corners || det.corners.length !== 8) continue
    const c = det.corners
    const detClass = det.label ?? det.class ?? 'object'
    const color = BOX_COLORS[detClass.toLowerCase()] || '#aaa'

    const xs = [], ys = [], zs = []
    for (const [a, b] of BOX_EDGES) {
      xs.push(c[a][0], c[b][0], null)
      ys.push(c[a][1], c[b][1], null)
      zs.push(c[a][2], c[b][2], null)
    }

    traces.push({
      type: 'scatter3d',
      mode: 'lines',
      x: xs, y: ys, z: zs,
      line: { color, width: 5 },
      name: `${detClass.toUpperCase()} [${(det.distance_m || 0).toFixed(1)}m]`,
      showlegend: true,
      hoverinfo: 'name',
    })
  }
  return traces
}

function buildLidarTrace(scenePoints, scenePointColors) {
  if (!Array.isArray(scenePoints) || scenePoints.length === 0) return null

  const xs = []
  const ys = []
  const zs = []
  const colorStrings = []
  for (const p of scenePoints) {
    if (!Array.isArray(p) || p.length < 3) continue
    const idx = xs.length
    xs.push(p[0])
    ys.push(p[1])
    zs.push(p[2])

    const c = Array.isArray(scenePointColors?.[idx]) ? scenePointColors[idx] : null
    if (c && c.length >= 3) {
      colorStrings.push(`rgb(${c[0]},${c[1]},${c[2]})`)
    } else {
      colorStrings.push('rgb(180,180,180)')
    }
  }

  if (xs.length === 0) return null

  return {
    type: 'scatter3d',
    mode: 'markers',
    x: xs,
    y: ys,
    z: zs,
    marker: {
      size: 1.5,
      color: colorStrings,
      opacity: 0.9,
    },
    name: 'LiDAR (camera RGB)',
    showlegend: true,
    hovertemplate: 'X(fwd): %{x:.1f} m<br>Y(left): %{y:.1f} m<br>Z(up): %{z:.1f} m<extra></extra>',
  }
}

export default function Scene3DTab() {
  const { result } = useAppStore()
  const containerRef = useRef(null)
  const plotRef = useRef(null)

  useEffect(() => {
    if (!result?.detections || !containerRef.current) return

    import('plotly.js-dist-min').then((Plotly) => {
      const traces = buildBoxTraces(result.detections)

      const lidarTrace = buildLidarTrace(result.scene_points, result.scene_point_colors)
      if (lidarTrace) {
        traces.unshift(lidarTrace)
      }

      traces.push({
        type: 'scatter3d',
        mode: 'markers+text',
        x: [0], y: [0], z: [0],
        marker: { size: 6, color: 'red', symbol: 'diamond' },
        text: ['EGO'],
        textposition: 'top center',
        name: 'Ego',
        showlegend: true,
        hoverinfo: 'name',
      })

      const frameId = result.frame_id ?? 'N/A'

      const layout = {
        title: {
          text: `<b>Fused PvP/YOLO 3D Detections — Frame ${frameId}</b><br><sup>LiDAR colored by RGB Photo | Bounding boxes overlaid</sup>`,
          x: 0.5,
        },
        paper_bgcolor: '#111',
        plot_bgcolor:  '#111',
        font: { color: 'white', size: 10 },
        margin: { l: 0, r: 0, t: 80, b: 0 },
        legend: {
          bgcolor: '#222',
          bordercolor: '#555',
          borderwidth: 1,
          font: { size: 10, color: 'white' },
        },
        scene: {
          bgcolor: '#111111',
          xaxis: { title: 'X — Forward (m)', backgroundcolor: '#1a1a1a', gridcolor: '#333', color: 'white' },
          yaxis: { title: 'Y — Left/Right (m)', backgroundcolor: '#1a1a1a', gridcolor: '#333', color: 'white' },
          zaxis: { title: 'Z — Elevation (m)', backgroundcolor: '#1a1a1a', gridcolor: '#333', color: 'white' },
          aspectmode: 'data',
          camera: {
            eye: { x: -0.3, y: -1.8, z: 0.9 },
            up:  { x: 0, y: 0, z: 1 },
          },
        },
        height: 700,
      }

      const config = {
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['sendDataToCloud', 'lasso2d', 'select2d'],
        responsive: true,
      }

      if (plotRef.current) {
        Plotly.react(containerRef.current, traces, layout, config)
      } else {
        Plotly.newPlot(containerRef.current, traces, layout, config)
        plotRef.current = true
      }
    })
  }, [result])

  if (!result?.detections) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#555]">
        <span className="text-sm">No 3D scene yet — run inference first</span>
      </div>
    )
  }

  return <div ref={containerRef} className="flex-1 w-full" style={{ minHeight: 0 }} />
}
