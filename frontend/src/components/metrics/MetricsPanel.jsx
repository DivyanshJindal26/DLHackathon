import GlassPanel from '../shared/GlassPanel'
import clsx from 'clsx'

function StatCard({ label, value, unit, good, warn }) {
  const color = value == null ? 'text-slate-500'
    : good != null && value <= good ? 'text-emerald-400'
    : warn != null && value <= warn ? 'text-amber-400'
    : 'text-red-400'

  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2.5 rounded-xl bg-slate-800/40 border border-slate-700/30">
      <span className={clsx('text-lg font-mono font-bold tabular-nums', color)}>
        {value != null ? value : '—'}{unit && value != null ? <span className="text-xs font-normal ml-0.5 text-slate-400">{unit}</span> : null}
      </span>
      <span className="text-xs text-slate-500 text-center leading-tight">{label}</span>
    </div>
  )
}

function MatchRow({ pair, index }) {
  const errColor = pair.dist_error_m < 2 ? 'text-emerald-400'
    : pair.dist_error_m < 5 ? 'text-amber-400'
    : 'text-red-400'

  return (
    <tr className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
      <td className="px-3 py-2 text-xs text-slate-500 font-mono">{index + 1}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className={clsx('text-xs font-medium', pair.class_match ? 'text-emerald-400' : 'text-red-400')}>
            {pair.pred_class}
          </span>
          {!pair.class_match && (
            <span className="text-xs text-slate-600">← GT: {pair.gt_class}</span>
          )}
          {pair.class_match && (
            <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          )}
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-slate-300">{pair.pred_dist}m</td>
      <td className="px-3 py-2 font-mono text-xs text-slate-400">{pair.gt_dist}m</td>
      <td className={clsx('px-3 py-2 font-mono text-xs font-semibold', errColor)}>
        {pair.dist_error_m}m
        <span className="text-slate-600 font-normal ml-1">({pair.dist_error_pct}%)</span>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-slate-400">{pair.iou_2d}</td>
    </tr>
  )
}

export default function MetricsPanel({ metrics }) {
  if (!metrics) return null

  const { matched, false_positives, false_negatives, summary } = metrics

  return (
    <GlassPanel className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Evaluation vs Ground Truth
          </span>
          <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-full px-2 py-0.5">
            {summary.matched} matched
          </span>
          {summary.false_positives > 0 && (
            <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/25 rounded-full px-2 py-0.5">
              {summary.false_positives} FP
            </span>
          )}
          {summary.false_negatives > 0 && (
            <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded-full px-2 py-0.5">
              {summary.false_negatives} FN
            </span>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {summary.matched > 0 && (
        <div className="grid grid-cols-3 gap-2 p-3 border-b border-slate-800/40 sm:grid-cols-6">
          <StatCard label="MAE Distance" value={summary.mae_distance_m} unit="m" good={1} warn={3} />
          <StatCard label="Mean Dist Err" value={summary.mean_dist_error_pct} unit="%" good={5} warn={15} />
          <StatCard label="Mean IoU 2D" value={summary.mean_iou_2d} good={0.7} warn={0.5} />
          <StatCard label="Class Acc." value={summary.class_accuracy != null ? (summary.class_accuracy * 100).toFixed(0) : null} unit="%" good={90} warn={70} />
          <StatCard label="Recall" value={summary.recall != null ? (summary.recall * 100).toFixed(0) : null} unit="%" good={80} warn={60} />
          <StatCard label="Precision" value={summary.precision != null ? (summary.precision * 100).toFixed(0) : null} unit="%" good={80} warn={60} />
        </div>
      )}

      {/* Matched pairs table */}
      {matched.length > 0 ? (
        <div className="overflow-auto max-h-48">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-sm">
              <tr>
                {['#', 'Class', 'Pred Dist', 'GT Dist', 'Error', 'IoU 2D'].map((h) => (
                  <th key={h} className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matched.map((pair, i) => (
                <MatchRow key={i} pair={pair} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-3 text-xs text-slate-600">
          No matched pairs found — IoU threshold may be too high, or bboxes don't overlap.
        </div>
      )}

      {/* Unmatched */}
      {(false_positives.length > 0 || false_negatives.length > 0) && (
        <div className="flex gap-4 px-4 py-3 border-t border-slate-800/40 text-xs">
          {false_positives.length > 0 && (
            <div>
              <span className="text-red-400 font-semibold">False positives: </span>
              <span className="text-slate-400">{false_positives.map(d => `${d.class} @${d.distance_m}m`).join(', ')}</span>
            </div>
          )}
          {false_negatives.length > 0 && (
            <div>
              <span className="text-amber-400 font-semibold">Missed (GT only): </span>
              <span className="text-slate-400">{false_negatives.map(d => `${d.class} @${d.distance_m}m`).join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  )
}
