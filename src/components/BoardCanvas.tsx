import { useAuth, useQuery, useRecordContext, useUserLookup } from 'deepspace'
import { ArrowLeft, Check, Copy, Focus, Link2, Minus, MousePointer2, Plus, Sparkles, StickyNote, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { AiInsightsDrawer } from './AiInsightsDrawer'
import { CanvasMinimap } from './CanvasMinimap'
import { NoteComposer } from './NoteComposer'
import { StickyCard } from './StickyCard'
import { ColorSwatches, StudioDock, StudioShortcuts, type NoteColor } from './StudioControls'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui'
import { boardPath, boardRequest, updateRecentNoteCount, type BoardSummary } from '@/lib/board-api'
import { readReactions } from '@/lib/board-reactions'
import { BOARD_TEMPLATES, planTemplate, seedTemplate } from '@/lib/board-templates'
import { canvasToScreen, MAX_ZOOM, MIN_ZOOM, NOTE_HEIGHT } from '@/lib/canvas-viewport'
import { useBoardActions } from '@/lib/use-board-actions'
import { useBoardPresence } from '@/lib/use-board-presence'
import { useCanvasViewport } from '@/lib/use-canvas-viewport'
import {
  CANVAS_HEIGHT, CANVAS_WIDTH, MAX_NOTES, NOTE_WIDTH, keepNoteOnCanvas,
  type BoardDetails, type Note, type NoteFields, type Point,
} from '@/schemas/board-schema'

type Draft = { key: string; point: Point; color: NoteColor }
type CreateAction = Draft & { markdown: string }
const themeKey = 'spaceboard:studio-theme'
const notesQuery = { orderBy: 'createdAt', orderDir: 'asc', limit: MAX_NOTES } as const
const noteCenter = (point: Point) => ({ x: point.x + NOTE_WIDTH / 2, y: point.y + NOTE_HEIGHT / 2 })

function readDarkTheme() {
  try { return localStorage.getItem(themeKey) === 'dark' } catch { return false }
}

export function BoardCanvas({ board }: { board: BoardDetails }) {
  const { records, status } = useQuery<NoteFields>('notes', notesQuery)
  const { status: roomStatus, ready } = useRecordContext()
  const { userId } = useAuth()
  const { getName } = useUserLookup()
  const view = useCanvasViewport()
  const actions = useBoardActions(board.id, records)
  const [selected, setSelected] = useState<string>()
  const [editing, setEditing] = useState<string>()
  const [draft, setDraft] = useState<Draft>()
  const editingId = editing && records.some(({ recordId }) => recordId === editing) ? editing : null
  const { collaborators, connected, broadcast } = useBoardPresence(board.id, editingId)
  const [pan, setPan] = useState(false)
  const [space, setSpace] = useState(false)
  const [dark, setDark] = useState(readDarkTheme)
  const [color, setColor] = useState<NoteColor>('lemon')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [topVoted, setTopVoted] = useState(false)
  const [popover, setPopover] = useState<'templates' | 'help' | 'peers'>()
  const [seeding, setSeeding] = useState(false)
  const [adding, setAdding] = useState(false)
  const createLock = useRef(false)
  const seedRetry = useRef<{ id: string; notes: ReturnType<typeof planTemplate> } | null>(null)
  const aiCreateRetry = useRef(new Map<number, CreateAction>())
  const [share, setShare] = useState(false)
  const [copied, setCopied] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [theme, setTheme] = useState<number | null>(null)
  const [summary, setSummary] = useState<BoardSummary>()
  const [summaryError, setSummaryError] = useState('')
  const [summaryBusy, setSummaryBusy] = useState(false)
  const summaryRequest = useRef<AbortController | null>(null)
  const searchField = useRef<HTMLInputElement>(null)
  const editable = ready && roomStatus === 'connected' && status === 'ready'
  const editingAnything = Boolean(draft || editingId)
  const canAdd = editable && !editingAnything && !seeding && !adding && !actions.layoutBusy && records.length < MAX_NOTES
  const shareUrl = new URL(boardPath(board.id), window.location.origin).href
  const activeTheme = theme === null ? undefined : summary?.themes[theme]
  const themeNotes = new Set(activeTheme?.noteIds)
  const counts = useMemo(() => new Map(records.map((note) => [note.recordId, readReactions(note.data.reactions).length])), [records])
  const highestCount = Math.max(0, ...counts.values())
  const term = query.trim().toLowerCase()
  const matchedCount = term ? actions.notes.filter(({ data }) => data.markdown.toLowerCase().includes(term)).length : 0

  useEffect(() => () => summaryRequest.current?.abort(), [])
  useEffect(() => {
    if (userId && status === 'ready') updateRecentNoteCount(userId, board.id, records.length)
  }, [userId, board.id, status, records.length])
  useEffect(() => {
    if (searchOpen) searchField.current?.focus()
  }, [searchOpen])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    try { localStorage.setItem(themeKey, next ? 'dark' : 'light') } catch { /* Storage is optional. */ }
  }

  function startDraft(point?: Point) {
    if (!canAdd) return
    const center = point ?? view.center()
    const preferred = { x: center.x - NOTE_WIDTH / 2, y: center.y - NOTE_HEIGHT / 2 }
    const next = point ? keepNoteOnCanvas(preferred) : actions.availableSpot(preferred)
    if (!next) { actions.setError('Make some space on the canvas before adding a note.'); return }
    setPopover(undefined)
    setSelected(undefined)
    setDraft({ key: crypto.randomUUID(), point: next, color })
    if (!point) view.focus(noteCenter(next))
  }

  async function createTemplate(templateId: string) {
    const template = BOARD_TEMPLATES.find(({ id }) => id === templateId)
    if (!template || !canAdd || createLock.current) return
    const retry = seedRetry.current?.id === templateId ? seedRetry.current : null
    if (!retry && records.length + template.notes.length > MAX_NOTES) {
      actions.setError('This template would exceed the board’s note limit.')
      return
    }
    createLock.current = true
    setSeeding(true)
    actions.setError('')
    try {
      const plan = retry?.notes ?? planTemplate(template, actions.notes.map(({ data }) => data))
      seedRetry.current = { id: templateId, notes: plan }
      await seedTemplate(board.id, plan)
      seedRetry.current = null
      setPopover(undefined)
      view.fit(plan)
    } catch (failure) {
      actions.report(failure)
    } finally {
      setSeeding(false)
      createLock.current = false
    }
  }

  async function addGenerated(markdown: string, preferred: Point, noteColor: NoteColor, step?: number) {
    if (!canAdd || createLock.current) return
    const existing = step === undefined ? undefined : aiCreateRetry.current.get(step)
    const point = existing?.point ?? actions.availableSpot(preferred)
    if (!point) { actions.setError('Make some space on the canvas before adding a note.'); return }
    const placement = existing ?? { point, key: crypto.randomUUID(), markdown, color: noteColor }
    if (step !== undefined) aiCreateRetry.current.set(step, placement)
    createLock.current = true
    setAdding(true)
    actions.setError('')
    try {
      const id = await actions.createNote({ ...placement.point, key: placement.key, markdown: placement.markdown, color: placement.color })
      if (step !== undefined) aiCreateRetry.current.delete(step)
      setSelected(id)
      view.focus(noteCenter(point))
    } catch (failure) {
      actions.report(failure)
    } finally {
      setAdding(false)
      createLock.current = false
    }
  }

  function duplicate(note: Note) {
    void addGenerated(note.data.markdown, { x: note.data.x + NOTE_WIDTH + 20, y: note.data.y }, note.data.color)
  }

  async function saveDraft(markdown: string) {
    if (!draft) return
    const id = await actions.createNote({ ...draft.point, key: draft.key, markdown, color: draft.color })
    setSelected(id)
  }

  function toggleSearch() {
    if (searchOpen) setQuery('')
    setSearchOpen(!searchOpen)
  }

  function showTheme(index: number | null) {
    setTheme(index)
    if (index === null) return
    const ids = new Set(summary?.themes[index]?.noteIds)
    const points = actions.notes.filter(({ recordId }) => ids.has(recordId)).map(({ data }) => data)
    if (points.length) view.fit(points)
  }

  async function arrange(undo = false) {
    if (!editable || editingAnything || adding || seeding || !undo && !summary?.themes.length) return
    const positions = await actions.changeLayout(undo ? undefined : summary?.themes)
    if (positions?.length) {
      setTheme(null)
      const placed = new Map(positions.map((point) => [point.id, point]))
      view.fit(actions.notes.map(({ recordId, data }) => placed.get(recordId) ?? data))
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
    if (summaryRequest.current || !records.length) return
    const request = new AbortController()
    summaryRequest.current = request
    setSummaryError('')
    setSummaryBusy(true)
    try {
      const next = await boardRequest<BoardSummary>('/' + board.id + '/summary', { method: 'POST', signal: request.signal })
      if (!request.signal.aborted) {
        aiCreateRetry.current.clear()
        setSummary(next)
        setTheme(null)
      }
    } catch (failure) {
      if (!request.signal.aborted) setSummaryError(failure instanceof Error ? failure.message : 'Could not summarize the board.')
    } finally {
      if (summaryRequest.current === request) {
        summaryRequest.current = null
        setSummaryBusy(false)
      }
    }
  }

  useEffect(() => {
    function clearSpace() { setSpace(false) }
    function release(event: globalThis.KeyboardEvent) { if (event.code === 'Space') clearSpace() }
    window.addEventListener('blur', clearSpace)
    window.addEventListener('keyup', release)
    return () => {
      window.removeEventListener('blur', clearSpace)
      window.removeEventListener('keyup', release)
    }
  }, [])

  function panStart(event: PointerEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return
    const background = !event.target.closest('.sb-studio-note')
    const usePan = space || (pan || event.pointerType === 'touch') && background
    if (event.button === 1 || event.button === 0 && usePan) {
      view.startPan(event)
    } else if (background && !editingAnything) {
      setSelected(undefined)
      event.currentTarget.focus({ preventScroll: true })
    }
  }

  function handleShortcut(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Escape' && !editingAnything) {
      setPopover(undefined); setSearchOpen(false); setQuery(''); setTopVoted(false); setTheme(null); setSelected(undefined)
      return
    }
    if (!(event.target instanceof Element) || event.target.closest('input, textarea, [contenteditable], [role="dialog"]') || editingAnything) return
    const key = event.key.toLowerCase()
    if (key === ' ' && !event.target.closest('button, a')) { event.preventDefault(); setSpace(true); return }
    if (event.repeat) return
    if (key === 'n') startDraft()
    else if (key === 'v') setPan(false)
    else if (key === 'h') setPan(true)
    else if (key === '/') { setSearchOpen(true); searchField.current?.focus() }
    else if (key === '?') setPopover((value) => value === 'help' ? undefined : 'help')
    else if (key === 'enter' && selected && editable && !event.target.closest('button, a')) setEditing(selected)
    else return
    event.preventDefault()
  }

  function renderNote(note: Note) {
    const { recordId, data } = note
    const remoteEditor = collaborators.find((peer) => peer.editingNoteId === recordId)?.name
    const remoteDrag = collaborators.find((peer) => peer.dragging?.noteId === recordId)?.dragging ?? undefined
    const linked = themeNotes.has(recordId)
    const voted = highestCount > 0 && counts.get(recordId) === highestCount
    const inSearch = !term || data.markdown.toLowerCase().includes(term)
    return <StickyCard key={recordId} note={note} author={getName(note.createdBy) ?? 'Collaborator'}
      userId={userId ?? ''} editable={editable && !actions.layoutBusy} selected={selected === recordId} editing={editingId === recordId}
      dimmed={Boolean(activeTheme && !linked || !inSearch || topVoted && highestCount && !voted)}
      highlighted={linked || Boolean(topVoted && voted) || Boolean(term && inSearch)}
      toolbarBelow={canvasToScreen(data, view.camera).y < 36 * view.camera.zoom}
      remoteDrag={remoteDrag} remoteEditor={remoteEditor} pointAt={view.pointAt}
      onSelect={() => { if (!editingAnything) setSelected(recordId) }}
      onEdit={(active) => {
        if (active && editingAnything) return
        setEditing(active ? recordId : undefined)
        setSelected(recordId)
      }}
      onSave={async (markdown) => { await actions.patchNote(recordId, { markdown }) }}
      onColor={(next) => actions.patchNote(recordId, { color: next }).catch((failure) => { actions.report(failure); throw failure })}
      onMove={(point) => actions.moveNote(recordId, point)}
      onDrag={(cursor, point) => broadcast(cursor, point ? { noteId: recordId, ...point } : null)}
      onReact={(kind, active) => actions.reactToNote(recordId, kind, active).catch((failure) => { actions.report(failure); throw failure })}
      onDuplicate={() => duplicate(note)}
      onDelete={() => actions.deleteNote(recordId).catch((failure) => { actions.report(failure); throw failure })} />
  }

  return (
    <section aria-label={board.title} className="sb-board-frame sb-studio-frame" onKeyDown={handleShortcut}>
      <title>{board.title + ' | SpaceBoard'}</title>
      <header className="sb-studio-header">
        <div className="min-w-0">
          <Link to="/home" className="sb-board-back"><ArrowLeft size={14} /> Boards</Link>
          <h1>{board.title}</h1>
        </div>
        <div className="sb-studio-header-actions">
          <span role="status" className="sb-studio-status"><i data-live={editable} />{status === 'error' ? 'Sync unavailable' : editable ? 'Live' : 'Connecting…'}<span className="sb-studio-count"> · {records.length} {records.length === 1 ? 'note' : 'notes'}</span></span>
          {connected && <div className="sb-peer-anchor">
            <button type="button" className="sb-peer-trigger" aria-expanded={popover === 'peers'} onClick={() => setPopover(popover === 'peers' ? undefined : 'peers')}><Users size={15} /> {collaborators.length + 1} here</button>
            {popover === 'peers' && (
              <div className="sb-peer-list sb-hud" aria-label="Online collaborators">
                <div className="sb-peer-self"><span className="sb-peer-avatar" style={{ background: '#4f46e5' }}>Y</span>You</div>
                {collaborators.map((peer) => (
                  <button type="button" key={peer.userId} title={peer.cursor ? 'Jump to cursor' : 'Cursor is off the canvas'} disabled={!peer.cursor}
                    onClick={() => { if (peer.cursor) view.focus(peer.cursor); setPopover(undefined) }}>
                    <span className="sb-peer-avatar" style={{ background: peer.color }}>{peer.name.slice(0, 1).toUpperCase()}</span>{peer.name}
                  </button>
                ))}
              </div>
            )}
          </div>}
          <Button variant="outline" size="sm" className="sb-button-secondary" aria-expanded={insightsOpen} disabled={!records.length && !insightsOpen} onClick={() => {
            if (insightsOpen) { setInsightsOpen(false); setTheme(null); return }
            setInsightsOpen(true)
            if (!summary && !summaryError) void summarize()
          }}><Sparkles aria-hidden="true" /> Summarize board</Button>
          <Button size="sm" className="sb-button-primary" onClick={() => { setShare(true); setCopied(false) }}><Link2 aria-hidden="true" /> Share</Button>
        </div>
      </header>

      {actions.error && <div role="alert" className="sb-board-error"><span>{actions.error}</span><button type="button" aria-label="Dismiss error" onClick={() => actions.setError('')}><X size={16} /></button></div>}
      <div className="sb-studio-body" data-insights={insightsOpen}>
        <div className="sb-studio-canvas" data-theme={dark ? 'dark' : 'lavender'}>
          <div ref={view.viewport} className="sb-studio-viewport" aria-label="Canvas" tabIndex={0} data-pan={pan || space} data-panning={view.panning}
            onPointerDownCapture={panStart}
            onPointerMove={(event) => {
              if (view.panning) view.movePan(event)
              else if (event.pointerType !== 'touch' && !(event.target instanceof Element && event.target.closest('.sb-note-grip') && event.buttons)) broadcast(view.pointAt(event.clientX, event.clientY))
            }}
            onPointerUp={view.stopPan} onPointerCancel={view.stopPan} onLostPointerCapture={view.stopPan}
            onPointerLeave={() => broadcast(null)}
            onDoubleClick={(event) => {
              if (pan || space || !(event.target instanceof Element) || event.target.closest('.sb-studio-note')) return
              const point = view.pointAt(event.clientX, event.clientY)
              if (point.x >= 0 && point.y >= 0 && point.x <= CANVAS_WIDTH && point.y <= CANVAS_HEIGHT) startDraft(point)
            }}>
            <div className="sb-studio-world" style={{
              width: CANVAS_WIDTH, height: CANVAS_HEIGHT,
              transform: 'translate(' + view.camera.x + 'px,' + view.camera.y + 'px) scale(' + view.camera.zoom + ')',
            }}>
              {actions.notes.map(renderNote)}
              {draft && <div className="sb-studio-note sb-draft-note" style={{ left: draft.point.x, top: draft.point.y, width: NOTE_WIDTH }}>
                <div className={'sb-note-sheet sb-paper-' + draft.color}>
                  <div className="sb-draft-heading"><strong>New note</strong><ColorSwatches value={draft.color} onChange={(next) => setDraft({ ...draft, color: next })} /></div>
                  <NoteComposer key={draft.key} initial="" isNew onClose={() => setDraft(undefined)} onSave={saveDraft} />
                </div>
              </div>}
              {collaborators.map(({ userId: id, cursor, name, color: peerColor }) => cursor && (
                <div key={id} aria-hidden="true" className="sb-studio-cursor" style={{
                  color: peerColor, transform: 'translate(' + cursor.x + 'px,' + cursor.y + 'px) scale(' + 1 / view.camera.zoom + ')',
                }}><MousePointer2 size={18} fill="currentColor" /><span style={{ background: peerColor }}>{name}</span></div>
              ))}
            </div>
          </div>

          {(searchOpen || activeTheme || topVoted) && <div className="sb-studio-filters">
            {searchOpen && <div className="sb-filter-chip sb-hud">
              <input ref={searchField} aria-label="Find notes on canvas" placeholder="Find notes…" value={query} onChange={(event) => setQuery(event.target.value)} />
              {term && <small>{matchedCount} found</small>}
              <button type="button" aria-label="Close note search" onClick={toggleSearch}><X size={14} /></button>
            </div>}
            {activeTheme && <button type="button" className="sb-filter-chip sb-hud" onClick={() => setTheme(null)}>Showing theme: {activeTheme.name} <span>· Clear</span></button>}
            {topVoted && <button type="button" className="sb-filter-chip sb-hud" onClick={() => setTopVoted(false)}>{highestCount ? 'Top voted' : 'No votes yet'} <span>· Clear</span></button>}
          </div>}

          {!draft && (status !== 'ready' || !records.length) && <div className="sb-studio-empty-wrap">
            <section className="sb-studio-empty sb-hud">
              <span className="sb-insight-icon"><StickyNote size={22} /></span>
              <h2>{status === 'error' ? 'Couldn’t load notes' : status !== 'ready' ? 'Opening the canvas' : 'Start with an idea'}</h2>
              {status === 'ready' ? <>
                <p>Double-click the grid, or start with a template.</p>
                <div><Button size="sm" className="sb-button-primary" disabled={!canAdd} onClick={() => startDraft()}>Add first note</Button>
                  <Button size="sm" variant="outline" className="sb-button-secondary" disabled={!canAdd} onClick={() => setPopover('templates')}>Browse templates</Button></div>
              </> : status === 'error' ? <p>Refresh the page to reconnect.</p> : <span className="sb-loading-dots" aria-hidden="true"><i /><i /><i /></span>}
            </section>
          </div>}

          <div className="sb-zoom-controls sb-hud" role="group" aria-label="Canvas zoom">
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={view.camera.zoom <= MIN_ZOOM} onClick={() => view.zoom(view.camera.zoom - .15)}><Minus size={16} /></button>
            <button type="button" aria-label={'Reset zoom, currently ' + Math.round(view.camera.zoom * 100) + ' percent'} title="Reset zoom" onClick={() => view.zoom(1)}>{Math.round(view.camera.zoom * 100)}%</button>
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={view.camera.zoom >= MAX_ZOOM} onClick={() => view.zoom(view.camera.zoom + .15)}><Plus size={16} /></button>
            <button type="button" aria-label="Fit to notes" title="Fit to notes" onClick={() => view.fit(actions.notes.map(({ data }) => data))}><Focus size={17} /></button>
          </div>
          <CanvasMinimap notes={actions.notes} peers={collaborators} camera={view.camera} size={view.size} onJump={view.focus} />
          {popover === 'help' && <StudioShortcuts onClose={() => setPopover(undefined)} />}
          {popover === 'templates' && <section className="sb-studio-popover sb-hud" aria-label="Board templates">
            <header><h2>Add template notes</h2><button type="button" aria-label="Close templates" onClick={() => setPopover(undefined)}><X size={16} /></button></header>
            {BOARD_TEMPLATES.map((template) => <button type="button" className="sb-template-menu-item" key={template.id} disabled={!canAdd}
              onClick={() => void createTemplate(template.id)}><strong>{template.title}</strong><span>{template.notes.length} notes</span></button>)}
            {seeding && <p role="status">Adding notes…</p>}
          </section>}
          <StudioDock color={color} pan={pan} dark={dark} search={searchOpen} top={topVoted}
            canAdd={canAdd} templates={popover === 'templates'} help={popover === 'help'}
            onColor={setColor} onAdd={() => startDraft()} onMode={setPan} onTheme={toggleTheme} onSearch={toggleSearch}
            onTop={() => setTopVoted(!topVoted)} onTemplates={() => setPopover(popover === 'templates' ? undefined : 'templates')}
            onHelp={() => setPopover(popover === 'help' ? undefined : 'help')} />
        </div>
        {insightsOpen && <AiInsightsDrawer summary={summary} busy={summaryBusy} error={summaryError} theme={theme}
          onTheme={showTheme} onClose={() => { setInsightsOpen(false); setTheme(null) }} onGenerate={() => void summarize()}
          working={actions.layoutBusy || seeding || adding || editingAnything || !editable}
          canAdd={canAdd} canUndo={actions.canUndo} canGenerate={records.length > 0}
          onAdd={(step, index) => addGenerated(step, view.center(), index % 2 ? 'mint' : 'lilac', index)}
          onArrange={() => void arrange()} onUndo={() => void arrange(true)} />}
      </div>

      <Dialog open={share} onOpenChange={setShare}>
        <DialogContent className="border-slate-200 bg-white text-slate-950">
          <DialogTitle>Share board</DialogTitle>
          <DialogDescription>Anyone signed in with this link can open and edit the board.</DialogDescription>
          <label htmlFor="spaceboard-share-link" className="sr-only">Board link</label>
          <input id="spaceboard-share-link" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} className="sb-field min-w-0" />
          <Button className="sb-button-primary" onClick={() => void copyLink()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? 'Copied' : 'Copy link'}
          </Button>
          <span role="status" className="sr-only">{copied ? 'Board link copied' : ''}</span>
        </DialogContent>
      </Dialog>
    </section>
  )
}
