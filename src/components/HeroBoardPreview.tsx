import { MousePointer2, StickyNote } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { NOTE_COLORS } from '@/schemas/board-schema'
import { PaperSurface } from './SurfaceEffects'

const samples = [
  { title: 'Start small', text: 'Try a pilot with one team.', author: 'Maya', x: .09, y: .13, color: 0 },
  { title: 'Define success', text: 'What would make us do this again?', author: 'Jules', x: .53, y: .23, color: 1 },
  { title: 'Friday check-in', text: 'Bring one thing you learned.', author: 'Maya', x: .27, y: .57, color: 2 },
]

export function HeroBoardPreview() {
  const grid = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number; pointer: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [notes, setNotes] = useState(samples)
  const [active, setActive] = useState<number>()

  function start(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0 || !event.isPrimary) return
    drag.current = { index, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
    suppressClick.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    setActive(index)
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    const board = grid.current
    if (!current || current.pointer !== event.pointerId || !board) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (!current.moved && Math.hypot(dx, dy) < 5) return
    const bounds = board.getBoundingClientRect()
    const maxX = 1 - event.currentTarget.offsetWidth / board.clientWidth
    const maxY = 1 - event.currentTarget.offsetHeight / board.clientHeight
    current.x = event.clientX
    current.y = event.clientY
    current.moved = true
    setNotes((items) => items.map((item, index) => index === current.index ? {
      ...item, x: Math.max(0, Math.min(maxX, item.x + dx / bounds.width)),
      y: Math.max(0, Math.min(maxY, item.y + dy / bounds.height)),
    } : item))
  }

  function finish() {
    if (!drag.current) return
    suppressClick.current = drag.current.moved
    drag.current = null
  }

  return (
    <PaperSurface className="sb-hero-paper" spotlight>
      <div className="sb-demo">
        <div className="sb-demo-toolbar">
          <span><StickyNote size={15} aria-hidden="true" /> Project kickoff</span>
          <span><span className="sb-demo-dot" /> Interactive preview · drag a note</span>
        </div>
        <div className="sb-demo-grid" ref={grid}>
          {notes.map((note, index) => (
            <button key={note.title} type="button" className={'sb-demo-note sb-demo-interactive sb-paper-' + NOTE_COLORS[note.color]}
              aria-label={note.title + '. ' + note.text + ' Activate to change color.'}
              style={{ left: note.x * 100 + '%', top: note.y * 100 + '%', zIndex: active === index ? 2 : 1, rotate: [-5, 5, -3][index] + 'deg' }}
              onPointerDown={(event) => start(event, index)} onPointerMove={move}
              onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
              onClick={(event) => {
                if (suppressClick.current && event.detail > 0) { suppressClick.current = false; return }
                setActive(index)
                setNotes((items) => items.map((item, i) => i === index ? { ...item, color: (item.color + 1) % NOTE_COLORS.length } : item))
              }}>
              <strong>{note.title}</strong><span>{note.text}</span><small>{note.author}</small>
            </button>
          ))}
          <div className="sb-demo-cursor sb-demo-jules" aria-hidden="true"><MousePointer2 size={19} fill="currentColor" /> <span>Jules</span></div>
        </div>
      </div>
    </PaperSurface>
  )
}
