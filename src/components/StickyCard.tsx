import { Check, Copy, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { BoardMarkdown } from './BoardMarkdown'
import { MarkdownTools, NoteComposer, type NoteFormat } from './NoteComposer'
import { ColorSwatches, type NoteColor } from './StudioControls'
import { readReactions, REACTIONS, type Reaction, type ReactionKind } from '@/lib/board-reactions'
import { NOTE_WIDTH, keepNoteOnCanvas, type Note, type Point } from '@/schemas/board-schema'

type Props = {
  note: Note; author: string; userId: string; editable: boolean; selected: boolean; editing: boolean
  dimmed: boolean; highlighted: boolean; toolbarBelow: boolean; remoteDrag?: Point; remoteEditor?: string
  pointAt: (x: number, y: number) => Point
  onSelect: () => void; onEdit: (active: boolean) => void; onSave: (markdown: string) => Promise<void>
  onColor: (color: NoteColor) => Promise<unknown>; onMove: (point: Point) => Promise<boolean>
  onDrag: (cursor: Point | null, point: Point | null) => void
  onReact: (kind: ReactionKind, active: boolean) => Promise<Reaction[]>
  onDuplicate: () => void; onDelete: () => Promise<void>
}

const offsets: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
}

function noteTilt(id: string) {
  let hash = 0
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return ((hash % 25) - 12) / 10 + 'deg'
}

export function StickyCard(props: Props) {
  const { note, selected, editing, editable, remoteDrag } = props
  const { recordId, data } = note
  const [local, setLocal] = useState<Point>()
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [format, setFormat] = useState<NoteFormat>()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [optimisticVotes, setOptimisticVotes] = useState<{ source?: string; votes: Reaction[] }>()
  const drag = useRef<{ id: number; origin: Point; grab: Point; next: Point; moved: boolean } | null>(null)
  const renderedVotes = useMemo(() => readReactions(data.reactions), [data.reactions])
  const votes = optimisticVotes && optimisticVotes.source === data.reactions ? optimisticVotes.votes : renderedVotes
  const position = local ?? remoteDrag ?? data

  function begin(nextFormat?: NoteFormat) {
    if (!editable) return
    setFormat(nextFormat)
    props.onEdit(true)
  }

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (!editable || editing || saving || event.button !== 0 || !event.isPrimary) return
    const cursor = props.pointAt(event.clientX, event.clientY)
    const origin = { x: position.x, y: position.y }
    drag.current = { id: event.pointerId, origin, grab: { x: cursor.x - origin.x, y: cursor.y - origin.y }, next: origin, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    props.onSelect()
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active || active.id !== event.pointerId) return
    const cursor = props.pointAt(event.clientX, event.clientY)
    const next = keepNoteOnCanvas({ x: cursor.x - active.grab.x, y: cursor.y - active.grab.y })
    if (!active.moved && Math.hypot(next.x - active.origin.x, next.y - active.origin.y) < 3) return
    active.moved = true
    active.next = next
    setLocal(next)
    setDragging(true)
    props.onDrag(cursor, next)
  }

  async function finish(event: PointerEvent<HTMLButtonElement>, commit: boolean) {
    const active = drag.current
    if (!active || active.id !== event.pointerId) return
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!active.moved) return
    setSaving(true)
    try {
      // Keep the final ghost visible until the RecordRoom write acknowledges.
      if (commit) await props.onMove(active.next)
    } finally {
      props.onDrag(null, null)
      setLocal(undefined)
      setSaving(false)
    }
  }

  async function react(kind: ReactionKind) {
    if (actionBusy) return
    setActionBusy(true)
    try {
      const active = !votes.some((vote) => vote.kind === kind && vote.userId === props.userId)
      const result = await props.onReact(kind, active)
      setOptimisticVotes({ source: data.reactions, votes: result })
    } catch {
      // BoardCanvas reports request failures.
    } finally {
      setActionBusy(false)
    }
  }

  function deleteSelected() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setActionBusy(true)
    void props.onDelete().catch(() => {}).finally(() => { setActionBusy(false); setConfirmDelete(false) })
  }

  return (
    <article data-note-id={recordId} className="sb-studio-note"
      data-selected={selected} data-dragging={dragging} data-remote={!!remoteDrag} data-dimmed={props.dimmed} data-highlighted={props.highlighted} data-toolbar-below={props.toolbarBelow}
      style={{ width: NOTE_WIDTH, '--note-tilt': noteTilt(recordId), '--note-x': position.x + 'px', '--note-y': position.y + 'px' } as CSSProperties}
      tabIndex={0} aria-label={data.markdown.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80)}
      onPointerDown={() => { if (!selected) props.onSelect() }}
      onFocus={() => { if (!selected) props.onSelect() }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.key !== 'Enter') return
        event.preventDefault()
        begin()
      }}>
      {selected && editable && (
        <div className="sb-note-tools" role="group" aria-label="Selected note actions">
          <ColorSwatches value={data.color} onChange={(color) => { void props.onColor(color).catch(() => {}) }} />
          {!editing && <MarkdownTools onInsert={begin} />}
          {!editing && <button type="button" aria-label="Edit selected note" title="Edit note" onClick={() => begin()}><Pencil size={15} /></button>}
          <button type="button" aria-label="Duplicate note" title="Duplicate note" disabled={editing} onClick={props.onDuplicate}><Copy size={15} /></button>
          <button type="button" aria-label={confirmDelete ? 'Confirm delete note' : 'Delete note'} title={confirmDelete ? 'Confirm delete for everyone' : 'Delete note'} disabled={editing || actionBusy}
            onBlur={() => setConfirmDelete(false)} onClick={deleteSelected}>{confirmDelete ? <Check size={15} /> : <Trash2 size={15} />}</button>
        </div>
      )}
      <div className={'sb-note-sheet sb-paper-' + data.color} data-editing={editing || !!props.remoteEditor}>
        <div className="sb-note-titlebar">
          <button type="button" aria-label="Move note. Use the arrow keys when focused." title="Drag or use arrow keys" disabled={!editable || editing}
            className="sb-note-grip" onPointerDown={start} onPointerMove={move} onPointerUp={(event) => void finish(event, true)}
            onPointerCancel={(event) => void finish(event, false)} onLostPointerCapture={(event) => void finish(event, false)}
            onKeyDown={(event) => {
              const offset = offsets[event.key]
              if (!offset || saving) return
              event.preventDefault()
              const distance = event.shiftKey ? 32 : 8
              void props.onMove(keepNoteOnCanvas({ x: position.x + offset.x * distance, y: position.y + offset.y * distance }))
            }}><GripVertical size={16} /></button>
          {props.remoteEditor && <span className="sb-editing-pill">{props.remoteEditor} is editing…</span>}
          {!editing && <button type="button" aria-label="Edit note" title="Edit note" disabled={!editable} onClick={() => begin()}><Pencil size={15} /></button>}
        </div>
        {editing ? <NoteComposer initial={data.markdown} initialFormat={format} onSave={props.onSave} onClose={() => { props.onEdit(false); setFormat(undefined) }} /> : (
          <div className="sb-note-markdown" data-note-scroll onDoubleClick={(event) => {
            if (!(event.target instanceof Element) || !event.target.closest('a')) begin()
          }}><BoardMarkdown source={data.markdown} /></div>
        )}
        {!editing && (
          <footer className="sb-note-footer">
            <span title={props.author} className="sb-note-author">{props.author}</span>
            <div className="sb-note-reactions" aria-label="Reactions">
              {(Object.keys(REACTIONS) as ReactionKind[]).map((kind) => {
                const matching = votes.filter((vote) => vote.kind === kind)
                const active = matching.some((vote) => vote.userId === props.userId)
                return <button type="button" key={kind} title={kind} aria-label={kind + ' reaction, ' + matching.length + ' votes'}
                  aria-pressed={active} disabled={!editable || actionBusy} onClick={() => void react(kind)}>{REACTIONS[kind]}{matching.length > 0 && <span>{matching.length}</span>}</button>
              })}
            </div>
          </footer>
        )}
      </div>
    </article>
  )
}
