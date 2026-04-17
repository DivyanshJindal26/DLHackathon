import useAppStore from '../../store/appStore'
import { segmentDistance, formatDist } from '../../utils/distanceCalc'

export default function DistanceLegend({ detections }) {
  const { canvasPoints, clearCanvasPoints } = useAppStore()
  if (canvasPoints.length < 2) return null

  const segments = canvasPoints.map((pt, i) => {
    if (i === 0) return null
    const { pixDist, worldDist } = segmentDistance(canvasPoints[i - 1], pt, detections ?? [])
    return { i, pixDist, worldDist }
  }).filter(Boolean)

  return (
    <div className="absolute bottom-3 left-3 glass-elevated rounded-xl p-3 text-xs font-mono animate-fade-in min-w-[180px]">
      <div className="flex items-center justify-between gap-4 mb-2">
        <span className="text-cyan-400 font-semibold">Distances</span>
        <button
          onClick={clearCanvasPoints}
          className="text-slate-500 hover:text-red-400 transition-colors text-xs"
        >
          Clear
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {segments.map((seg) => (
          <div key={seg.i} className="flex items-center justify-between gap-3">
            <span className="text-slate-500">
              {seg.i}→{seg.i + 1}
            </span>
            <div className="flex flex-col items-end">
              {seg.worldDist != null && (
                <span className="text-cyan-300">{formatDist(seg.worldDist)}</span>
              )}
              <span className="text-slate-500">{seg.pixDist.toFixed(0)} px</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
