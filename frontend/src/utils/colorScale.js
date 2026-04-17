// Distance → color mapping (red=close, green=far)
const STOPS = [
  { dist: 0,  color: [239, 68,  68]  }, // red-500
  { dist: 5,  color: [249, 115, 22]  }, // orange-500
  { dist: 10, color: [245, 158, 11]  }, // amber-500
  { dist: 20, color: [132, 204, 22]  }, // lime-500
  { dist: 35, color: [34,  197, 94]  }, // green-500
]

function lerp(a, b, t) {
  return a + (b - a) * t
}

export function distanceToRgb(dist) {
  const d = Math.max(0, dist)
  for (let i = 0; i < STOPS.length - 1; i++) {
    const lo = STOPS[i]
    const hi = STOPS[i + 1]
    if (d <= hi.dist) {
      const t = (d - lo.dist) / (hi.dist - lo.dist)
      return [
        Math.round(lerp(lo.color[0], hi.color[0], t)),
        Math.round(lerp(lo.color[1], hi.color[1], t)),
        Math.round(lerp(lo.color[2], hi.color[2], t)),
      ]
    }
  }
  return STOPS[STOPS.length - 1].color
}

export function distanceToHex(dist) {
  const [r, g, b] = distanceToRgb(dist)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function distanceToRgba(dist, alpha = 1) {
  const [r, g, b] = distanceToRgb(dist)
  return `rgba(${r},${g},${b},${alpha})`
}

export function inferenceTimeBadgeClass(ms) {
  if (ms < 50) return 'badge-green'
  if (ms < 80) return 'badge-amber'
  return 'badge-red'
}

export const CLASS_COLORS = {
  Car:        '#60a5fa', // blue-400
  Pedestrian: '#34d399', // emerald-400
  Cyclist:    '#fbbf24', // amber-400
  Van:        '#a78bfa', // violet-400
  Truck:      '#f472b6', // pink-400
  Misc:       '#94a3b8', // slate-400
}

export function classColor(cls) {
  return CLASS_COLORS[cls] ?? CLASS_COLORS.Misc
}
