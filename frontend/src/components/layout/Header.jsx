import { useEffect } from 'react'
import PerfBadge from '../perf/PerfBadge'
import useAppStore from '../../store/appStore'
import { getScenes } from '../../api/scenesApi'

export default function Header() {
  const { result, scenes, selectedScene, setScenes, setSelectedScene, chatOpen, setChatOpen } = useAppStore()

  useEffect(() => {
    getScenes()
      .then(setScenes)
      .catch(() => {})
  }, [setScenes])

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-100 tracking-tight">LiDAR Fusion</span>
        </div>

        {scenes.length > 0 && (
          <select
            value={selectedScene ?? ''}
            onChange={(e) => setSelectedScene(e.target.value || null)}
            className="text-xs bg-slate-800/60 border border-slate-700/50 text-slate-300 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500/50 cursor-pointer"
          >
            <option value="">Upload files</option>
            {scenes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-3">
        {result && (
          <PerfBadge
            inferenceTimeMs={result.inference_time_ms}
            numPoints={result.num_points}
          />
        )}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
          AI Assistant
        </button>
      </div>
    </header>
  )
}
