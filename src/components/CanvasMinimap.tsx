import { useRef, type PointerEvent } from 'react'
import { CANVAS_HEIGHT, CANVAS_WIDTH, NOTE_WIDTH, type Note, type Point } from '@/schemas/board-schema'
import { NOTE_HEIGHT, screenToCanvas, type Camera, type Size } from '@/lib/canvas-viewport'
import type { StudioPeer } from '@/lib/use-board-presence'

const percent = (value: number, dimension: number) => value / dimension * 100 + '%'
const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))
const arrowSteps: Record<string, Point> = { ArrowLeft: { x: -180, y: 0 }, ArrowRight: { x: 180, y: 0 }, ArrowUp: { x: 0, y: -180 }, ArrowDown: { x: 0, y: 180 } }

export function CanvasMinimap({ notes, peers, camera, size, onJump }: {
  notes: Note[]; peers: StudioPeer[]; camera: Camera; size: Size
  onJump: (point: Point, smooth?: boolean) => void
}) {
  const drag = useRef<{ pointer: number; offset: Point } | null>(null)
  const start = screenToCanvas({ x: 0, y: 0 }, camera)
  const end = screenToCanvas({ x: size.width, y: size.height }, camera)
  const left = clamp(start.x, CANVAS_WIDTH)
  const top = clamp(start.y, CANVAS_HEIGHT)
  const right = clamp(end.x, CANVAS_WIDTH)
  const bottom = clamp(end.y, CANVAS_HEIGHT)
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 }

  function locate(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp((event.clientX - rect.left) / rect.width * CANVAS_WIDTH, CANVAS_WIDTH),
      y: clamp((event.clientY - rect.top) / rect.height * CANVAS_HEIGHT, CANVAS_HEIGHT),
    }
  }

  return (
    <div className="sb-minimap sb-hud">
      <div className="sb-minimap-label">Overview</div>
      <div tabIndex={0} role="group" aria-label="Canvas overview. Click, drag or use arrow keys to pan." className="sb-minimap-map"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          const point = locate(event)
          const inside = point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
          drag.current = { pointer: event.pointerId, offset: inside ? { x: center.x - point.x, y: center.y - point.y } : { x: 0, y: 0 } }
          if (!inside) onJump(point)
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointer !== event.pointerId) return
          const point = locate(event)
          onJump({ x: point.x + drag.current.offset.x, y: point.y + drag.current.offset.y }, false)
        }}
        onLostPointerCapture={() => { drag.current = null }}
        onKeyDown={(event) => {
          const step = arrowSteps[event.key]
          if (!step) return
          event.preventDefault()
          onJump({ x: center.x + step.x, y: center.y + step.y })
        }}>
        {notes.map(({ recordId, data }) => {
          const position = peers.find(({ dragging }) => dragging?.noteId === recordId)?.dragging ?? data
          return <i key={recordId} className={'sb-minimap-note sb-paper-' + data.color} style={{
            left: percent(position.x, CANVAS_WIDTH), top: percent(position.y, CANVAS_HEIGHT),
            width: percent(NOTE_WIDTH, CANVAS_WIDTH), height: percent(NOTE_HEIGHT, CANVAS_HEIGHT),
          }} />
        })}
        {peers.map(({ userId, cursor, color }) => cursor && (
          <i key={userId} className="sb-minimap-peer" style={{ left: percent(cursor.x, CANVAS_WIDTH), top: percent(cursor.y, CANVAS_HEIGHT), background: color }} />
        ))}
        <div className="sb-minimap-window" aria-hidden="true" style={{
          left: percent(left, CANVAS_WIDTH), top: percent(top, CANVAS_HEIGHT),
          width: percent(right - left, CANVAS_WIDTH), height: percent(bottom - top, CANVAS_HEIGHT),
        }} />
      </div>
    </div>
  )
}
