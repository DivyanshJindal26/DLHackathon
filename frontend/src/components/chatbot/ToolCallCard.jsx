import clsx from 'clsx'

export default function ToolCallCard({ toolCall }) {
  const { name, input, status, result } = toolCall
  const running = status === 'running'

  return (
    <div className={clsx(
      'rounded-xl border p-3 text-xs font-mono transition-all duration-300 animate-fade-in',
      running
        ? 'border-blue-500/30 bg-blue-500/5'
        : 'border-emerald-500/30 bg-emerald-500/5'
    )}>
      <div className="flex items-center gap-2 mb-2">
        {running ? (
          <svg className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
        <span className={running ? 'text-blue-300' : 'text-emerald-300'}>
          {name}
        </span>
        <span className={clsx('ml-auto text-xs', running ? 'text-blue-500' : 'text-emerald-600')}>
          {running ? 'searching...' : 'done'}
        </span>
      </div>

      {/* Input args */}
      <div className="text-slate-500 mb-1">
        {Object.entries(input ?? {}).map(([k, v]) => (
          <span key={k} className="mr-3">
            <span className="text-slate-600">{k}:</span>{' '}
            <span className="text-slate-400">{String(v)}</span>
          </span>
        ))}
      </div>

      {/* Result preview */}
      {result && !running && (
        <div className="mt-2 pt-2 border-t border-slate-800/60 text-slate-500 truncate">
          {Array.isArray(result)
            ? `${result.length} result${result.length !== 1 ? 's' : ''}`
            : JSON.stringify(result).slice(0, 80)}
        </div>
      )}
    </div>
  )
}
