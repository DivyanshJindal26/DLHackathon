import clsx from 'clsx'

export default function GlassPanel({ children, className, elevated = false }) {
  return (
    <div className={clsx(elevated ? 'glass-elevated' : 'glass', 'overflow-hidden', className)}>
      {children}
    </div>
  )
}
