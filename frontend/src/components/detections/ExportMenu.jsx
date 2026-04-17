import { useState, useRef, useEffect } from 'react'
import { exportJSON, exportCSV } from '../../utils/exportData'

export default function ExportMenu({ detections }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    function handler(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 glass-elevated rounded-xl overflow-hidden z-50 w-32 animate-fade-in">
          <button
            className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700/50 transition-colors"
            onClick={() => { exportJSON(detections); setOpen(false) }}
          >
            JSON
          </button>
          <button
            className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700/50 transition-colors"
            onClick={() => { exportCSV(detections); setOpen(false) }}
          >
            CSV
          </button>
        </div>
      )}
    </div>
  )
}
