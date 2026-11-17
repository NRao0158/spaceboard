import { GripVertical, Pencil } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { BoardMarkdown } from './BoardMarkdown'
import { cn } from '@/lib/utils'
import { NOTE_WIDTH, keepNoteOnCanvas, type Note, type NoteFields, type Point } from '@/schemas/board-schema'

const colors: Record<NoteFields['color'], string> = {
  lemon: 'border-[#eed97c] bg-[#fff1ac]',
  mint: 'border-[#9bd6ba] bg-[#caf0df]',
  lilac: 'border-[#cdbcfa] bg-[#e8ddff]',
  peach: 'border-[#f1bda8] bg-[#ffddcc]',
}

interface StickyCardProps {
  note: Note
  author: string
  editable: boolean
  onEdit: (note: Note) => void
  onMove: (id: string, point: Point) => Promise<boolean>
}

const offsets: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
}

export function StickyCard({ note, author, editable, onEdit, onMove }: StickyCardProps) {
  const { recordId, data } = note
  const [position, setPosition] = useState<Point>()
  const [saving, setSaving] = useState(false)
  const drag = useRef<{ pointer: number; initial: Point; origin: Point; next: Point } | null>(null)
  const displayed = position ?? data

  async function saveMove(next: Point) {
    if (next.x === data.x && next.y === data.y) {
      setPosition(undefined)
      return
    }
    setPosition(next)
    setSaving(true)
    try {
      await onMove(recordId, next)
    } finally {
      setSaving(false)
      setPosition(undefined)
    }
  }

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (!editable || saving || event.button !== 0 || !event.isPrimary) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointer: event.pointerId,
      initial: { x: event.clientX, y: event.clientY },
      origin: { x: data.x, y: data.y },
      next: { x: data.x, y: data.y },
    }
    setPosition(drag.current.next)
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    active.next = keepNoteOnCanvas({
      x: active.origin.x + event.clientX - active.initial.x,
      y: active.origin.y + event.clientY - active.initial.y,
    })
    setPosition(active.next)
  }

  function finish(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    void saveMove(active.next)
  }

  function cancel() {
    if (!drag.current) return
    drag.current = null
    setPosition(undefined)
  }

  function nudge(event: KeyboardEvent<HTMLButtonElement>) {
    const offset = offsets[event.key]
    if (!offset || !editable || saving) return
    event.preventDefault()
    const step = event.shiftKey ? 50 : 12
    void saveMove(keepNoteOnCanvas({ x: data.x + offset.x * step, y: data.y + offset.y * step }))
  }

  return (
    <article
      data-note-id={recordId}
      className={cn(
        'absolute flex min-h-36 flex-col rounded-2xl border text-slate-900 shadow-sm focus-within:z-10 hover:z-10',
        colors[data.color],
        position && 'z-20 shadow-lg',
      )}
      style={{ width: NOTE_WIDTH, left: displayed.x, top: displayed.y }}
    >
      <div className="flex items-center justify-between px-2 pt-2">
        <button
          type="button"
          aria-label="Move note. Use the arrow keys when focused."
          title="Drag or use arrow keys"
          className="grid size-8 touch-none place-items-center rounded-lg text-slate-700 enabled:cursor-grab enabled:hover:bg-black/8 enabled:active:cursor-grabbing"
          disabled={!editable}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onKeyDown={nudge}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Edit note"
          title="Edit note"
          className="grid size-8 place-items-center rounded-lg text-slate-700 enabled:hover:bg-black/8"
          disabled={!editable}
          onClick={() => onEdit(note)}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-48 overflow-auto px-4 text-sm leading-relaxed">
        <BoardMarkdown source={data.markdown} />
      </div>
      <p title={author} className="mt-auto truncate px-4 pb-3 pt-3 text-xs font-medium text-slate-700">{author}</p>
    </article>
  )
}
