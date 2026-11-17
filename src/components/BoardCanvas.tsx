import { getUserColor, usePresenceRoom, useQuery, useRecordContext, useUserLookup } from 'deepspace'
import { ArrowLeft, Check, Copy, Link2, Plus, Sparkles, StickyNote, Users } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { BoardMarkdown } from './BoardMarkdown'
import { NoteComposer } from './NoteComposer'
import { StickyCard } from './StickyCard'
import { Magnetic } from './SurfaceEffects'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui'
import { boardPath, boardRequest, type BoardSummary } from '@/lib/board-api'
import {
  CANVAS_HEIGHT, CANVAS_WIDTH, MAX_NOTES, boardRoomId, keepNoteOnCanvas,
  type BoardDetails, type Note, type NoteFields, type Point,
} from '@/schemas/board-schema'

type Draft = { key: string; point: Point; note?: Note }
const control = 'sb-button-secondary shadow-none'
const primary = 'sb-button-primary'
const cursorColors = ['#4338ca', '#047857', '#a21caf', '#b45309', '#0e7490']

function readCursor(value: unknown): Point | null {
  if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)) return null
  const { x, y } = value
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null
  if (x < 0 || x > CANVAS_WIDTH || y < 0 || y > CANVAS_HEIGHT) return null
  return { x, y }
}

export function BoardCanvas({ board }: { board: BoardDetails }) {
  const { records, status } = useQuery<NoteFields>('notes', { orderBy: 'createdAt', orderDir: 'asc', limit: MAX_NOTES })
  const { status: roomStatus, ready } = useRecordContext()
  const { getName } = useUserLookup()
  const { peers, connected, updateState } = usePresenceRoom(boardRoomId(board.id))
  const scroller = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const lastCursor = useRef(0)
  const summaryRequest = useRef<AbortController | null>(null)
  const [draft, setDraft] = useState<Draft>()
  const [error, setError] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [summary, setSummary] = useState<BoardSummary>()
  const [pendingMoves, setPendingMoves] = useState<Record<string, Point>>({})
  const editable = ready && roomStatus === 'connected' && status === 'ready'
  const canAdd = editable && records.length < MAX_NOTES
  const path = '/' + board.id
  const shareUrl = new URL(boardPath(board.id), window.location.origin).href

  useEffect(() => () => summaryRequest.current?.abort(), [])

  useEffect(() => {
    setPendingMoves((pending) => {
      const stillWaiting = Object.entries(pending).filter(([id, point]) => {
        const note = records.find((record) => record.recordId === id)
        return note && (note.data.x !== point.x || note.data.y !== point.y)
      })
      return stillWaiting.length === Object.keys(pending).length ? pending : Object.fromEntries(stillWaiting)
    })
  }, [records])

  function trackCursor(event: PointerEvent<HTMLDivElement>) {
    const now = performance.now()
    if (!connected || !surface.current || now - lastCursor.current < 42) return
    lastCursor.current = now
    const rect = surface.current.getBoundingClientRect()
    const cursor = readCursor({ x: Math.round(event.clientX - rect.left), y: Math.round(event.clientY - rect.top) })
    updateState({ cursor })
  }

  function addNote() {
    if (!canAdd) return
    const view = scroller.current
    const left = view?.scrollLeft ?? 0
    const top = view?.scrollTop ?? 0
    let point = keepNoteOnCanvas({ x: left + 24, y: top + 24 })
    const columns = Math.max(1, Math.floor(((view?.clientWidth ?? 520) - 24) / 270))
    for (let i = 0; i <= records.length; i += 1) {
      point = keepNoteOnCanvas({ x: left + 24 + (i % columns) * 270, y: top + 24 + Math.floor(i / columns) * 200 })
      if (!records.some(({ data }) => Math.abs(data.x - point.x) < 248 && Math.abs(data.y - point.y) < 190)) break
    }
    setDraft({ key: crypto.randomUUID(), point })
  }

  function editNote(note: Note) {
    setDraft({ key: note.recordId, point: { x: note.data.x, y: note.data.y }, note })
  }

  async function saveNote(data: Pick<NoteFields, 'markdown' | 'color'>) {
    if (!draft) return
    if (draft.note) {
      await boardRequest(path + '/notes/' + draft.note.recordId, { method: 'PATCH', data })
    } else {
      await boardRequest(path + '/notes', { method: 'POST', data: { ...data, ...draft.point, key: draft.key } })
      const view = scroller.current
      if (view && draft.point.y + 180 > view.scrollTop + view.clientHeight) {
        view.scrollTop = Math.max(0, draft.point.y - 20)
      }
    }
  }

  async function deleteNote() {
    if (draft?.note) await boardRequest(path + '/notes/' + draft.note.recordId, { method: 'DELETE' })
  }

  async function moveNote(id: string, point: Point) {
    setError('')
    setPendingMoves((current) => ({ ...current, [id]: point }))
    try {
      await boardRequest(path + '/notes/' + id, { method: 'PATCH', data: point })
      return true
    } catch (failure) {
      setPendingMoves((current) => {
        if (current[id] !== point) return current
        const next = { ...current }
        delete next[id]
        return next
      })
      setError(failure instanceof Error ? failure.message : 'Could not move the note.')
      return false
    } finally {
      // The subscribed data normally arrives before this timer. Clear any
      // lingering draft overlay so a collaborator's movement always wins.
      window.setTimeout(() => {
        setPendingMoves((current) => {
          if (current[id] !== point) return current
          const next = { ...current }
          delete next[id]
          return next
        })
      }, 900)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch {
      const input = document.querySelector<HTMLInputElement>('#spaceboard-share-link')
      input?.focus()
      input?.select()
    }
  }

  async function summarize() {
    if (summaryRequest.current) return
    const request = new AbortController()
    summaryRequest.current = request
    setSummary(undefined)
    setSummaryError('')
    setSummaryBusy(true)
    try {
      const result = await boardRequest<BoardSummary>(path + '/summary', { method: 'POST', signal: request.signal })
      if (!request.signal.aborted) setSummary(result)
    } catch (failure) {
      if (!request.signal.aborted) setSummaryError(failure instanceof Error ? failure.message : 'Could not summarize board.')
    } finally {
      if (summaryRequest.current === request) {
        summaryRequest.current = null
        setSummaryBusy(false)
      }
    }
  }

  const roomText = status === 'error' ? 'Sync unavailable' : editable ? 'Live' : 'Connecting…'
  const boardIsEmpty = status === 'ready' && records.length === 0

  return (
    <section aria-label={board.title} className="sb-board-frame flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-white text-slate-950">
      <title>{board.title + ' | SpaceBoard'}</title>
      <header className="sb-board-header flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <Link to="/home" className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Boards
          </Link>
          <h1 className="break-words text-2xl font-semibold tracking-tight">{board.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className={control} disabled={!records.length} onClick={() => { setSummaryOpen(true); if (!summary && !summaryError) void summarize() }}>
            <Sparkles aria-hidden="true" /> Summarize board
          </Button>
          <Button size="sm" className={primary} onClick={() => { setShareOpen(true); setCopied(false) }}>
            <Link2 aria-hidden="true" /> Share
          </Button>
        </div>
      </header>

      <div className="sb-board-toolbar flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2 sm:px-6">
        <Button variant="outline" size="sm" className={control} disabled={!canAdd} onClick={addNote}>
          <Plus aria-hidden="true" /> Add note
        </Button>
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
          <span>{records.length} {records.length === 1 ? 'note' : 'notes'}</span>
          {connected && <span title={peers.map((peer) => peer.userName).join(', ')} className="sb-state-badge"><Users className="size-4" aria-hidden="true" /> {peers.length + 1} here</span>}
          <span role="status" className="sb-state-badge">
            <span className={'size-2 rounded-full ' + (editable ? 'bg-emerald-600' : 'bg-amber-500')} aria-hidden="true" /> {roomText}
          </span>
        </div>
      </div>
      {error && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>}

      <div className="relative min-h-60 flex-1 overflow-hidden bg-[#f8f8fc]">
        <div ref={scroller} className="absolute inset-0 overflow-auto" aria-label="Canvas" tabIndex={0}>
          <div
            ref={surface}
            className="sb-board-grid relative isolate overflow-hidden"
            style={boardIsEmpty ? { width: '100%', height: '100%' } : { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
            onPointerMove={trackCursor}
            onPointerLeave={() => { if (connected) updateState({ cursor: null }) }}
          >
            {records.map((note) => (
              <StickyCard
                key={note.recordId}
                note={pendingMoves[note.recordId] ? { ...note, data: { ...note.data, ...pendingMoves[note.recordId] } } : note}
                author={getName(note.createdBy) ?? 'Collaborator'}
                editable={editable}
                onEdit={editNote}
                onMove={moveNote}
              />
            ))}
            {peers.map((peer) => {
              const cursor = readCursor(peer.state.cursor)
              if (!cursor) return null
              const color = getUserColor(peer.userId, cursorColors)
              return (
                <div key={peer.userId} aria-hidden="true" className="pointer-events-none absolute z-30 flex items-start gap-1" style={{ left: cursor.x, top: cursor.y, color }}>
                  <svg width="15" height="19" viewBox="0 0 15 19" fill="currentColor" aria-hidden="true"><path d="M1 1v16l4-4 3 5 3-2-3-5h6Z" /></svg>
                  <span className="mt-3 max-w-32 truncate rounded-md px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: color }}>{peer.userName}</span>
                </div>
              )
            })}
          </div>
        </div>
        {(boardIsEmpty || status !== 'ready') && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-5">
            <div className="sb-board-empty pointer-events-auto w-full max-w-sm rounded-2xl bg-white p-6 text-center sm:p-8">
              <div className="mx-auto grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                <StickyNote className="size-6" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">
                {boardIsEmpty ? 'Start with an idea' : status === 'error' ? 'Couldn’t load notes' : 'Opening the canvas'}
              </h2>
              {boardIsEmpty ? (
                <>
                  <p className="mb-4 mt-2 text-sm text-slate-600">Add a sticky note to start the brainstorm.</p>
                  <Magnetic><Button className={primary} disabled={!canAdd} onClick={addNote}><Plus aria-hidden="true" /> Add first note</Button></Magnetic>
                </>
              ) : status === 'error' ? (
                <p className="mt-2 text-sm text-slate-600">Refresh the page to reconnect.</p>
              ) : (
                <span className="sb-loading-dots mt-3" aria-hidden="true"><i /><i /><i /></span>
              )}
            </div>
          </div>
        )}
      </div>

      {draft && <NoteComposer key={draft.key} note={draft.note} onClose={() => setDraft(undefined)} onSave={saveNote} onDelete={deleteNote} />}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="border-slate-200 bg-white text-slate-950">
          <DialogTitle>Share board</DialogTitle>
          <DialogDescription className="text-slate-600">Anyone signed in with this link can open and edit the board.</DialogDescription>
          <label htmlFor="spaceboard-share-link" className="sr-only">Board link</label>
          <input id="spaceboard-share-link" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <Button className={primary} onClick={() => void copyLink()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? 'Copied' : 'Copy link'}
          </Button>
          <span role="status" className="sr-only">{copied ? 'Board link copied' : ''}</span>
        </DialogContent>
      </Dialog>
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto border-slate-200 bg-white text-slate-950">
          <DialogTitle>Board summary</DialogTitle>
          <DialogDescription className="text-slate-600">Themes and possible next steps from the current notes.</DialogDescription>
          {summaryBusy && <p role="status" className="rounded-xl bg-indigo-50 p-4 text-sm font-medium text-indigo-900">Reading notes…</p>}
          {summaryError && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{summaryError}</p>}
          {summary && (
            <>
              <p className="text-xs font-medium text-slate-600">Based on {summary.included} of {summary.total} notes</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed">
                <BoardMarkdown source={summary.summary} />
              </div>
            </>
          )}
          {(summary || summaryError) && <Button variant="outline" className={control} onClick={() => void summarize()} disabled={summaryBusy}>Generate again</Button>}
        </DialogContent>
      </Dialog>
    </section>
  )
}
