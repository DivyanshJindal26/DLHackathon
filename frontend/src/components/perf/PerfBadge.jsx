import { useEffect, useState } from 'react'
import Badge from '../shared/Badge'
import { inferenceTimeBadgeClass } from '../../utils/colorScale'

function useCountUp(target, duration = 600) {
  const [display, setDisplay] = useState(target)
  useEffect(() => {
    if (target == null) return
    const start = performance.now()
    const from = display ?? 0
    function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      setDisplay(Math.round(from + (target - from) * t))
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  return display
}

export default function PerfBadge({ inferenceTimeMs, numPoints }) {
  const ms = useCountUp(inferenceTimeMs)
  const pts = useCountUp(numPoints)

  if (inferenceTimeMs == null) return null

  const variant = inferenceTimeBadgeClass(inferenceTimeMs).replace('badge-', '')

  return (
    <div className="flex items-center gap-2">
      <Badge variant={variant} className="animate-fade-in">
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-slow" />
        {ms}ms
      </Badge>
      {numPoints != null && (
        <Badge variant="slate" className="animate-fade-in">
          {pts != null ? `${(pts / 1000).toFixed(1)}K` : '—'} pts
        </Badge>
      )}
    </div>
  )
}
