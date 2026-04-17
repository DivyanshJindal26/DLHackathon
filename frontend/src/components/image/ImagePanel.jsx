import GlassPanel from '../shared/GlassPanel'
import EmptyState from '../shared/EmptyState'
import AnnotatedCanvas from './AnnotatedCanvas'
import DistanceLegend from './DistanceLegend'
import useAppStore from '../../store/appStore'
import clsx from 'clsx'

export default function ImagePanel() {
  const {
    result,
    hoveredDetectionId,
    clickedDetectionId,
    setHoveredDetectionId,
    setClickedDetectionId,
    canvasMode,
    toggleCanvasMode,
    canvasPoints,
    clearCanvasPoints,
    uploadStatus,
  } = useAppStore()

  const detections = result?.detections ?? []

  return (
    <GlassPanel className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Annotated Image
        </span>
        <div className="flex items-center gap-2">
          {canvasMode === 'measure' && canvasPoints.length > 0 && (
            <button
              onClick={clearCanvasPoints}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-0.5 rounded"
            >
              Clear points
            </button>
          )}
          <button
            onClick={toggleCanvasMode}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200',
              canvasMode === 'measure'
                ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400'
                : 'bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-300'
            )}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-1.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
            {canvasMode === 'measure' ? 'Measuring' : 'Measure'}
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center bg-slate-950/40 overflow-hidden">
        {uploadStatus === 'uploading' ? (
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Running inference...</span>
          </div>
        ) : result?.annotated_image ? (
          <>
            <AnnotatedCanvas
              base64Image={result.annotated_image}
              detections={detections}
              hoveredId={hoveredDetectionId}
              clickedId={clickedDetectionId}
            />
            <DistanceLegend detections={detections} />
          </>
        ) : (
          <EmptyState
            icon="🔭"
            title="No scene loaded"
            description="Upload .bin, .png, and calib.txt files, then click Run Inference"
          />
        )}
      </div>
    </GlassPanel>
  )
}
