import { useState } from 'react'
import GlassPanel from '../shared/GlassPanel'
import EmptyState from '../shared/EmptyState'
import BEVPlot from './BEVPlot'
import useAppStore from '../../store/appStore'

export default function BEVPanel() {
  const { result, confidenceThreshold } = useAppStore()
  const [mode, setMode] = useState('image') // 'image' | 'plotly'

  return (
    <GlassPanel className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Bird's Eye View
        </span>
        {result && (
          <div className="flex items-center gap-1 bg-slate-900/60 rounded-lg p-0.5">
            {['image', 'plotly'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                  mode === m
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {m === 'image' ? 'Static' : 'Interactive'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 relative bg-slate-950/40 flex items-center justify-center overflow-hidden">
        {!result ? (
          <EmptyState
            icon="🗺️"
            title="No scene loaded"
            description="Run inference to see the bird's eye view"
          />
        ) : mode === 'image' ? (
          <img
            src={`data:image/png;base64,${result.bev_image}`}
            alt="Bird's eye view"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="w-full h-full">
            <BEVPlot
              detections={result.detections}
              confidenceThreshold={confidenceThreshold}
            />
          </div>
        )}
      </div>
    </GlassPanel>
  )
}
