import { MousePointer2, SmilePlus, StickyNote } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { NOTE_COLORS } from '@/schemas/board-schema'
import { connectorCurve } from '@/lib/board-edges'
import { EmoteBursts } from './PresenceExtras'
import type { Emote } from '@/lib/use-board-presence'
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

  const [size, setSize] = useState({ width: 0, height: 0, noteHeight: 100 })
  const [emotes, setEmotes] = useState<Emote[]>([])
  const expiry = useRef<number | undefined>(undefined)
  useEffect(() => {
    const board = grid.current
    if (!board) return
    const observer = new ResizeObserver(() => setSize({
      width: board.clientWidth, height: board.clientHeight, noteHeight: board.querySelector('button')?.offsetHeight ?? 100,
    }))
    observer.observe(board)
    return () => { observer.disconnect(); clearTimeout(expiry.current) }
  }, [])
  const from = { x: (notes[0].x + .39) * size.width, y: notes[0].y * size.height + size.noteHeight / 2 }
  const to = { x: notes[1].x * size.width, y: notes[1].y * size.height + size.noteHeight / 2 }
  const curve = connectorCurve(from, to, 'right', 'left')

  function sendPreviewEmote() {
    const event = { id: crypto.randomUUID(), emoji: '🎉' as const, point: { x: size.width * .83, y: size.height * .74 }, updatedAt: Date.now() }
    setEmotes([event])
    clearTimeout(expiry.current)
    expiry.current = window.setTimeout(() => setEmotes([]), 1650)
  }

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
          <span><span className="sb-demo-dot" /> Drag a note <button type="button" className="sb-demo-emote" onClick={sendPreviewEmote} aria-label="Send preview emote"><SmilePlus size={16} /></button></span>
        </div>
        <div className="sb-demo-grid" ref={grid}>
          {size.width > 0 && <svg className="sb-demo-thread" width={size.width} height={size.height} aria-hidden="true">
            <defs><marker id="preview-thread-arrow" markerWidth="11" markerHeight="11" refX="10" refY="5.5" orient="auto"><path d="M0 0 L11 5.5 L0 11 Z" fill="#cbbaff" /></marker></defs>
            <path d={curve.path} fill="none" stroke="#cbbaff" strokeWidth="2" markerEnd="url(#preview-thread-arrow)" />
          </svg>}
          <EmoteBursts items={emotes} />
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
