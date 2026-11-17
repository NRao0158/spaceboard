import type { ReactNode } from 'react'
import { useSurfaceMotion } from '@/lib/surface-motion'
import { cn } from '@/lib/utils'

export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const motion = useSurfaceMotion<HTMLSpanElement>()
  return <span {...motion} className={cn('sb-magnetic', className)}>{children}</span>
}

export function PaperSurface({ children, className, spotlight = false }: {
  children: ReactNode
  className?: string
  spotlight?: boolean
}) {
  const motion = useSurfaceMotion<HTMLDivElement>()
  return (
    <div {...motion} className={cn('sb-paper', className)}>
      {spotlight && <div className="sb-spotlight" aria-hidden="true" />}
      <div className="sb-paper-plane">
        {children}
        <div className="sb-paper-glare" aria-hidden="true" />
      </div>
    </div>
  )
}
