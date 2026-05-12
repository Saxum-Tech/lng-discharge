import { normalizeDegrees } from '@/lib/open-meteo'

type DirectionArrowProps = {
  degrees: number | null
  className?: string
}

export function DirectionArrow({ degrees, className }: DirectionArrowProps) {
  const normalized = normalizeDegrees(degrees)

  if (normalized == null) {
    return <span className={className}>•</span>
  }

  return (
    <span
      className={`inline-block ${className ?? ''}`.trim()}
      style={{ transform: `rotate(${normalized}deg)` }}
      aria-hidden="true"
    >
      ↑
    </span>
  )
}
