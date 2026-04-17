import { classColor, distanceToRgba } from '../../utils/colorScale'
import clsx from 'clsx'

export default function DetectionRow({ det, index, isHovered, isClicked, onHover, onClick }) {
  const cc = classColor(det.class)
  const distBg = distanceToRgba(det.distance_m ?? 50, 0.12)

  return (
    <tr
      className={clsx(
        'transition-colors cursor-pointer border-b border-slate-800/40',
        isHovered ? 'bg-slate-700/30' : isClicked ? 'bg-blue-500/10' : 'hover:bg-slate-800/30'
      )}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(isClicked ? null : index)}
    >
      {/* Class */}
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: cc }}
          />
          <span className="text-xs font-medium text-slate-200">{det.class}</span>
        </div>
      </td>

      {/* Distance */}
      <td className="px-3 py-2 whitespace-nowrap" style={{ background: distBg }}>
        <span className="text-xs font-mono text-slate-200">
          {det.distance_m != null ? `${det.distance_m.toFixed(1)} m` : '—'}
        </span>
      </td>

      {/* Confidence */}
      <td className="px-3 py-2 w-28">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(det.confidence ?? 0) * 100}%`,
                background: det.confidence > 0.7 ? '#22c55e' : det.confidence > 0.5 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
          <span className="text-xs font-mono text-slate-400 w-8 text-right">
            {((det.confidence ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
      </td>

      {/* XYZ */}
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="text-xs font-mono text-slate-500">
          {det.xyz ? det.xyz.map((v) => v.toFixed(1)).join(', ') : '—'}
        </span>
      </td>

      {/* BBox */}
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="text-xs font-mono text-slate-600">
          {det.bbox_2d
            ? `${Math.round(det.bbox_2d[2] - det.bbox_2d[0])}×${Math.round(det.bbox_2d[3] - det.bbox_2d[1])}`
            : '—'}
        </span>
      </td>
    </tr>
  )
}
