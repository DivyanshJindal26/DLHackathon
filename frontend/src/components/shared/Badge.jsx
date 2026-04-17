import clsx from 'clsx'

export default function Badge({ children, variant = 'slate', className }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-medium',
        `badge-${variant}`,
        className
      )}
    >
      {children}
    </span>
  )
}
