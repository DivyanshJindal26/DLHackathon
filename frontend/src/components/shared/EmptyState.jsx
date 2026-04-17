export default function EmptyState({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 py-12">
      {icon && <div className="text-4xl opacity-40">{icon}</div>}
      <p className="text-sm font-medium text-slate-400">{title}</p>
      {description && <p className="text-xs text-slate-600 text-center max-w-xs">{description}</p>}
    </div>
  )
}
