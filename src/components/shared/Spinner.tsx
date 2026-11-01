import { Ring2 } from 'ldrs/react'
import 'ldrs/react/Ring2.css'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/** App-wide spinner (ldrs Ring2) */
export function Spinner({ size = 16, stroke = 2, color = 'currentColor', className }: { size?: number; stroke?: number; color?: string; className?: string }) {
  return (
    <span role="status" aria-label="Loading" className={cx('inline-flex shrink-0', className)}>
      <Ring2 size={size} stroke={stroke} strokeLength={0.25} bgOpacity={0.15} speed={0.8} color={color} />
    </span>
  )
}
