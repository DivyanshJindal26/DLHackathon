import useAppStore from '../../store/appStore'
import clsx from 'clsx'

export default function BulkResultsGallery() {
  const { bulkFrames, bulkSelectedIdx, setBulkSelectedIdx, setResult } = useAppStore()

  if (!bulkFrames.length) return null

  function select(idx) {
    setBulkSelectedIdx(idx)
    setResult(bulkFrames[idx])
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
        {bulkFrames.length} Frames
      </p>
      <div className="overflow-y-auto max-h-[calc(100vh-220px)] pr-0.5 space-y-2">
        {bulkFrames.map((frame, idx) => {
          const dets = frame.detections || []
          const nCars = dets.filter((d) => (d.label || d.class || '').toLowerCase() === 'car').length
          const nPed = dets.filter((d) => {
            const cls = (d.label || d.class || '').toLowerCase()
            return cls === 'pedestrian' || cls === 'person'
          }).length
          const nOther = dets.length - nCars - nPed
          const isSelected  = idx === bulkSelectedIdx
          const thumb = frame.camera_image || frame.annotated_image
          const inferenceMs = Number(frame.inference_time_ms || 0)

          return (
            <button
              key={frame.frame_id ?? idx}
              onClick={() => select(idx)}
              className={clsx(
                'w-full text-left rounded-xl overflow-hidden border transition-all duration-150',
                isSelected
                  ? 'border-blue-500 ring-1 ring-blue-500/50'
                  : 'border-slate-700/50 hover:border-slate-500'
              )}
            >
              {/* Thumbnail */}
              <div className="relative">
                {thumb ? (
                  <img
                    src={`data:image/png;base64,${thumb}`}
                    alt={`Frame ${frame.frame_id}`}
                    className="w-full h-24 object-cover object-center"
                  />
                ) : (
                  <div className="w-full h-24 bg-[#111] flex items-center justify-center text-[10px] text-[#555]">
                    no preview
                  </div>
                )}
                {isSelected && (
                  <div className="absolute top-1 right-1 bg-blue-500 rounded-full w-4 h-4 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Metadata row */}
              <div className="px-2 py-1.5 bg-slate-900/60 flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-slate-400 truncate">
                  {frame.frame_id ?? `#${idx}`}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {nCars > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      {nCars}C
                    </span>
                  )}
                  {nPed > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">
                      {nPed}P
                    </span>
                  )}
                  {nOther > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-600/50 text-slate-400">
                      {nOther}+
                    </span>
                  )}
                  <span className="text-[10px] text-slate-600 font-mono">
                    {inferenceMs.toFixed(0)}ms
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
