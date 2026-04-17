import { useRef, useState } from 'react'
import clsx from 'clsx'

const ICONS = {
  bin: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
    </svg>
  ),
  image: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  ),
  calib: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125v-.75c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v.75M9 10.5H4.5m4.5 0V6m0 4.5h6m-6 0V6m0 0h6m0 4.5V6" />
    </svg>
  ),
  label: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
}

const LABELS = { bin: 'LiDAR .bin', image: 'Image .png', calib: 'Calib .txt', label: 'Labels .txt (optional)' }
const ACCEPT = { bin: '.bin', image: '.png,.jpg,.jpeg', calib: '.txt', label: '.txt' }

export default function FileSlot({ type, file, onFile }) {
  const inputRef = useRef()
  const [drag, setDrag] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      className={clsx(
        'relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-all duration-200 min-h-[90px]',
        drag
          ? 'border-blue-400 bg-blue-500/10'
          : file
          ? 'border-emerald-500/50 bg-emerald-500/5'
          : 'border-slate-700/60 bg-slate-800/20 hover:border-slate-600 hover:bg-slate-800/40'
      )}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[type]}
        className="hidden"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      <div className={clsx('transition-colors', file ? 'text-emerald-400' : 'text-slate-500')}>
        {ICONS[type]}
      </div>
      <div className="text-center">
        <p className="text-xs font-medium text-slate-400">{LABELS[type]}</p>
        {file ? (
          <p className="text-xs text-emerald-400 truncate max-w-[120px]">{file.name}</p>
        ) : (
          <p className="text-xs text-slate-600">drop or click</p>
        )}
      </div>
      {file && (
        <button
          className="absolute top-1.5 right-1.5 text-slate-600 hover:text-red-400 transition-colors"
          onClick={(e) => { e.stopPropagation(); onFile(null) }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
