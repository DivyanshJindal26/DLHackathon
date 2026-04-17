import { useMemo, useState } from 'react'
import GlassPanel from '../shared/GlassPanel'
import EmptyState from '../shared/EmptyState'
import DetectionRow from './DetectionRow'
import ExportMenu from './ExportMenu'
import useAppStore from '../../store/appStore'

const COLUMNS = [
  { key: 'class',       label: 'Class',      sortable: true  },
  { key: 'distance_m',  label: 'Distance',   sortable: true  },
  { key: 'confidence',  label: 'Confidence', sortable: true  },
  { key: 'xyz',         label: 'XYZ (m)',    sortable: false },
  { key: 'bbox_2d',     label: 'BBox',       sortable: false },
]

export default function DetectionTable() {
  const {
    result,
    confidenceThreshold,
    hoveredDetectionId,
    clickedDetectionId,
    setHoveredDetectionId,
    setClickedDetectionId,
  } = useAppStore()

  const [sort, setSort] = useState({ col: 'distance_m', dir: 'asc' })

  const filtered = useMemo(() => {
    if (!result?.detections) return []
    const f = result.detections.filter((d) => (d.confidence ?? 0) >= confidenceThreshold)
    return [...f].sort((a, b) => {
      const av = a[sort.col] ?? (sort.col === 'class' ? '' : 0)
      const bv = b[sort.col] ?? (sort.col === 'class' ? '' : 0)
      if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sort.dir === 'asc' ? av - bv : bv - av
    })
  }, [result, confidenceThreshold, sort])

  function toggleSort(col) {
    setSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))
  }

  return (
    <GlassPanel className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Detections
          </span>
          {filtered.length > 0 && (
            <span className="text-xs bg-slate-700/60 text-slate-400 rounded-full px-2 py-0.5">
              {filtered.length}
            </span>
          )}
        </div>
        {filtered.length > 0 && <ExportMenu detections={filtered} />}
      </div>

      <div className="overflow-auto max-h-52">
        {filtered.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No detections"
            description={result ? 'Try lowering the confidence threshold' : 'Run inference first'}
          />
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-sm">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap select-none"
                    style={{ cursor: col.sortable ? 'pointer' : 'default' }}
                    onClick={() => col.sortable && toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && sort.col === col.key && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d={sort.dir === 'asc'
                              ? 'M4.5 15.75 7.5 12m0 0 3 3.75M7.5 12V18'
                              : 'M4.5 10.5 7.5 6m0 0 3 4.5M7.5 6v6'}
                          />
                        </svg>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((det, i) => (
                <DetectionRow
                  key={i}
                  det={det}
                  index={i}
                  isHovered={hoveredDetectionId === i}
                  isClicked={clickedDetectionId === i}
                  onHover={setHoveredDetectionId}
                  onClick={setClickedDetectionId}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </GlassPanel>
  )
}
