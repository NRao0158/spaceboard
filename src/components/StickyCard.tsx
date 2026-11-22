import { Check, Copy, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import { BoardMarkdown } from './BoardMarkdown'
import { MarkdownTools, NoteComposer, type NoteFormat } from './NoteComposer'
import { NotePorts } from './BoardEdgesLayer'
import type { Port } from '@/lib/board-edges'
import { ColorSwatches, type NoteColor } from './StudioControls'
import { readReactions, REACTIONS, type Reaction, type ReactionKind } from '@/lib/board-reactions'
import { NOTE_WIDTH, keepNoteOnCanvas, type Note, type Point } from '@/schemas/board-schema'

type Props = {
  note: Note; author: string; userId: string; editable: boolean; selected: boolean; editing: boolean
  dimmed: boolean; highlighted: boolean; toolbarBelow: boolean; dragPosition?: Point; dragState?: 'local' | 'remote'; remoteEditor?: string
  threadSource?: boolean; threadTarget?: boolean; pulsed?: boolean; group?: boolean
  onSelect: (shift: boolean) => void; onStartDrag: (event: PointerEvent<HTMLButtonElement>) => void;
  onStartEdge: (event: PointerEvent<HTMLButtonElement>, port: Port) => void; onEdit: (active: boolean) => void; onSave: (markdown: string) => Promise<void>
  onColor: (color: NoteColor) => Promise<unknown>; onMove: (point: Point) => Promise<boolean>
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
  const { note, selected, editing, editable, dragPosition } = props
  const { recordId, data } = note
  const [format, setFormat] = useState<NoteFormat>()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [colorChange, setColorChange] = useState<{ from: NoteColor; to: NoteColor }>()
  const [colorBusy, setColorBusy] = useState(false)
  const [optimisticVotes, setOptimisticVotes] = useState<{ source?: string; votes: Reaction[] }>()
  const renderedVotes = useMemo(() => readReactions(data.reactions), [data.reactions])
  const votes = optimisticVotes && optimisticVotes.source === data.reactions ? optimisticVotes.votes : renderedVotes
  const position = dragPosition ?? data
  const shownColor = colorChange?.from === data.color ? colorChange.to : data.color

  function begin(nextFormat?: NoteFormat) {
    if (!editable) return
    setFormat(nextFormat)
    props.onEdit(true)
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

  async function changeColor(color: NoteColor) {
    if (colorBusy || shownColor === color) return
    const change = { from: data.color, to: color }
    setColorBusy(true)
    setColorChange(change)
    try {
      await props.onColor(color)
      // The subscription replaces the optimistic value. Expire it if the
      // connection drops after the server acknowledges the write.
      window.setTimeout(() => setColorChange((current) => current === change ? undefined : current), 1000)
    } catch {
      setColorChange(undefined)
    } finally {
      setColorBusy(false)
    }
  }

  function deleteSelected() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setActionBusy(true)
    void props.onDelete().catch(() => {}).finally(() => { setActionBusy(false); setConfirmDelete(false) })
  }

  return (
    <article data-note-id={recordId} className="sb-studio-note"
      data-selected={selected} data-dragging={props.dragState === 'local'} data-remote={props.dragState === 'remote'} data-thread={props.threadSource || props.threadTarget} data-pulsed={props.pulsed} data-dimmed={props.dimmed} data-highlighted={props.highlighted} data-toolbar-below={props.toolbarBelow}
      style={{ width: NOTE_WIDTH, '--note-tilt': noteTilt(recordId), '--note-x': position.x + 'px', '--note-y': position.y + 'px' } as CSSProperties}
      tabIndex={0} aria-label={data.markdown.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80)}
      onClick={(event) => {
        if (!editing && event.target instanceof Element && !event.target.closest('button, a, input, select, textarea')) props.onSelect(event.shiftKey)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.key !== 'Enter') return
        event.preventDefault()
        begin()
      }}>
      {selected && editable && !props.group && (
        <div className="sb-note-tools" role="group" aria-label="Selected note actions">
          <ColorSwatches value={shownColor} disabled={colorBusy} onChange={(color) => void changeColor(color)} />
          {!editing && <MarkdownTools onInsert={begin} />}
          {!editing && <button type="button" aria-label="Edit selected note" title="Edit note" onClick={() => begin()}><Pencil size={15} /></button>}
          <button type="button" aria-label="Duplicate note" title="Duplicate note" disabled={editing} onClick={props.onDuplicate}><Copy size={15} /></button>
          <button type="button" aria-label={confirmDelete ? 'Confirm delete note' : 'Delete note'} title={confirmDelete ? 'Confirm delete for everyone' : 'Delete note'} disabled={editing || actionBusy}
            onBlur={() => setConfirmDelete(false)} onClick={deleteSelected}>{confirmDelete ? <Check size={15} /> : <Trash2 size={15} />}</button>
        </div>
      )}
      {editable && !editing && <NotePorts onStart={props.onStartEdge} />}
      <div className={'sb-note-sheet sb-paper-' + shownColor} data-editing={editing || !!props.remoteEditor}>
        <div className="sb-note-titlebar">
          <button type="button" aria-label="Move note. Use the arrow keys when focused." title="Drag or use arrow keys" disabled={!editable || editing}
            className="sb-note-grip" onPointerDown={props.onStartDrag}
            onKeyDown={(event) => {
              const offset = offsets[event.key]
              if (!offset) return
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
