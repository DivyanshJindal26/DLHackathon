import { useRef, useEffect, useCallback } from 'react'
import { distanceToHex, classColor } from '../../utils/colorScale'
import { useCanvasPoints } from '../../hooks/useCanvasPoints'
import { segmentDistance } from '../../utils/distanceCalc'
import useAppStore from '../../store/appStore'

// Edge pairs for 12-edge cuboid wireframe (corners 0-3=front, 4-7=back)
const FRONT_EDGES = [[0,1],[1,2],[2,3],[3,0]]
const BACK_EDGES  = [[4,5],[5,6],[6,7],[7,4]]
const SIDE_EDGES  = [[0,4],[1,5],[2,6],[3,7]]

function drawBox3d(ctx, det, isHovered, isClicked) {
  const color   = isHovered ? '#ffffff' : distanceToHex(det.distance_m ?? 50)
  const alpha   = isHovered || isClicked ? 1 : 0.85
  const pts     = det.corners_2d  // (8,2) or null
  const [x1, y1, x2, y2] = det.bbox_2d ?? []

  ctx.save()
  ctx.globalAlpha = alpha

  if (pts && pts.length === 8) {
    // 3-D wireframe
    const front_w = isHovered || isClicked ? 2.5 : 2
    const back_w  = isHovered || isClicked ? 1.5 : 1

    const p = (i) => [pts[i][0], pts[i][1]]
    const line = (i, j, w) => {
      ctx.beginPath()
      ctx.lineWidth = w
      ctx.moveTo(...p(i))
      ctx.lineTo(...p(j))
      ctx.stroke()
    }

    ctx.strokeStyle = color
    FRONT_EDGES.forEach(([i, j]) => line(i, j, front_w))
    BACK_EDGES.forEach(([i, j])  => line(i, j, back_w))
    SIDE_EDGES.forEach(([i, j])  => line(i, j, back_w))

    if (isHovered || isClicked) {
      // Highlight front face fill
      ctx.fillStyle = isHovered ? 'rgba(255,255,255,0.06)' : 'rgba(59,130,246,0.06)'
      ctx.beginPath()
      FRONT_EDGES.forEach(([i], k) => k === 0 ? ctx.moveTo(...p(i)) : ctx.lineTo(...p(i)))
      ctx.closePath()
      ctx.fill()
    }
  } else if (x1 != null) {
    // Fallback: 2-D rectangle
    ctx.strokeStyle = color
    ctx.lineWidth = isHovered || isClicked ? 3 : 1.5
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
    if (isHovered || isClicked) {
      ctx.fillStyle = isHovered ? 'rgba(255,255,255,0.08)' : 'rgba(59,130,246,0.08)'
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
    }
  }

  // Label — anchor to top-left of front face or bbox
  const label = `${det.class} ${det.distance_m != null ? det.distance_m.toFixed(1) + 'm' : ''}`
  ctx.font = 'bold 11px monospace'
  const tw = ctx.measureText(label).width
  const lh = 14
  let lx, ly
  if (pts && pts.length === 8) {
    lx = Math.min(...pts.slice(0, 4).map(p => p[0]))
    ly = Math.max(Math.min(...pts.slice(0, 4).map(p => p[1])) - lh - 2, 0)
  } else {
    lx = x1 ?? 0
    ly = Math.max((y1 ?? lh) - lh - 2, 0)
  }
  ctx.fillStyle = isHovered ? 'rgba(255,255,255,0.9)' : `${color}dd`
  ctx.fillRect(lx - 1, ly, tw + 8, lh + 2)
  ctx.fillStyle = isHovered ? '#000' : '#fff'
  ctx.fillText(label, lx + 3, ly + lh - 1)

  ctx.restore()
}

function drawMeasureOverlay(ctx, points, detections, canvasWidth) {
  if (points.length === 0) return

  const cyan = '#22d3ee'

  // Draw lines between consecutive points
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1]
    const p2 = points[i]
    const mx = (p1.x + p2.x) / 2
    const my = (p1.y + p2.y) / 2

    ctx.save()
    ctx.strokeStyle = cyan
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    ctx.setLineDash([])

    // Distance badge at midpoint
    const { pixDist, worldDist } = segmentDistance(p1, p2, detections ?? [])
    const label = worldDist != null
      ? `${worldDist.toFixed(1)}m`
      : `${pixDist.toFixed(0)}px`
    ctx.font = 'bold 10px monospace'
    const tw = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(mx - tw / 2 - 4, my - 9, tw + 8, 16)
    ctx.fillStyle = cyan
    ctx.fillText(label, mx - tw / 2, my + 3)
    ctx.restore()
  }

  // Draw points last (on top)
  points.forEach((pt, i) => {
    ctx.save()
    ctx.fillStyle = cyan
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // Index label
    ctx.font = 'bold 9px monospace'
    ctx.fillStyle = '#000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(i + 1, pt.x, pt.y)
    ctx.restore()
  })
}

export default function AnnotatedCanvas({ base64Image, detections, hoveredId, clickedId }) {
  const canvasRef = useRef()
  const imgRef = useRef(null)
  const { canvasMode } = useAppStore()
  const { canvasPoints, handleCanvasClick, handleCanvasRightClick } = useCanvasPoints(detections)

  // Load image
  useEffect(() => {
    if (!base64Image) return
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      redraw()
    }
    img.src = `data:image/png;base64,${base64Image}`
  }, [base64Image]) // eslint-disable-line react-hooks/exhaustive-deps

  function redraw() {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    detections?.forEach((det, i) =>
      drawBox3d(ctx, det, i === hoveredId, i === clickedId)
    )
    if (canvasMode === 'measure') {
      drawMeasureOverlay(ctx, canvasPoints, detections, canvas.width)
    }
  }

  useEffect(() => { redraw() }, [base64Image, detections, hoveredId, clickedId, canvasPoints, canvasMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const onClick = useCallback((e) => handleCanvasClick(e, canvasRef.current), [handleCanvasClick])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-contain"
      style={{ cursor: canvasMode === 'measure' ? 'crosshair' : 'default', display: 'block' }}
      onClick={onClick}
      onContextMenu={handleCanvasRightClick}
    />
  )
}
