import { useAuth, useQuery, useRecordContext, useUserLookup } from 'deepspace'
import { ArrowLeft, Cable, Check, Copy, Expand, FileText, Focus, Frame, LayoutTemplate, Link2, Minus, Moon, MousePointer2, Plus, Sparkles, StickyNote, Timer, Users, Volume2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { BoardEdgesLayer } from './BoardEdgesLayer'
import { BoardFacilitator } from './BoardFacilitator'
import { BoardSectionFrame } from './BoardSectionFrame'
import { BoardTimer } from './BoardTimer'
import { CanvasMinimap } from './CanvasMinimap'
import { NoteComposer } from './NoteComposer'
import { CursorChat, EmoteBursts, EmoteWheel, RemoteChat } from './PresenceExtras'
import { EdgeEditor, SelectionToolbar } from './SpatialTools'
import { ColorSwatches, StudioDock, StudioShortcuts, type NoteColor } from './StudioControls'
import { StickyCard } from './StickyCard'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui'
import { boardPath, updateRecentNoteCount } from '@/lib/board-api'
import { edgeCurve } from '@/lib/board-edges'
import { buildActionBrief } from '@/lib/board-export'
import { layoutWithSections } from '@/lib/board-insights'
import { readReactions } from '@/lib/board-reactions'
import { MAX_SECTIONS } from '@/lib/board-sections'
import { readStudio, type StudioOp } from '@/lib/board-studio'
import { BOARD_TEMPLATES, planTemplate } from '@/lib/board-templates'
import { canvasToScreen, MAX_ZOOM, MIN_ZOOM, NOTE_HEIGHT } from '@/lib/canvas-viewport'
import { unlockSound } from '@/lib/sound-fx'
import { useStudioCommands, type StudioCommand } from '@/lib/studio-commands'
import { useBoardActions } from '@/lib/use-board-actions'
import { useBoardFacilitator } from '@/lib/use-board-facilitator'
import { EMOTES, useBoardPresence } from '@/lib/use-board-presence'
import { useCanvasViewport } from '@/lib/use-canvas-viewport'
import { useStudioSession } from '@/lib/use-studio-session'
import { useSpatialTools } from '@/lib/use-spatial-tools'
import {
  CANVAS_HEIGHT, CANVAS_WIDTH, MAX_NOTES, NOTE_WIDTH, keepNoteOnCanvas,
  type BoardDetails, type BoardFields, type Note, type NoteFields, type Point,
} from '@/schemas/board-schema'

type Draft = { key: string; point: Point; color: NoteColor }
const themeKey = 'spaceboard:studio-theme'
const notesQuery = { orderBy: 'createdAt', orderDir: 'asc', limit: MAX_NOTES } as const
const noteCenter = (point: Point) => ({ x: point.x + NOTE_WIDTH / 2, y: point.y + NOTE_HEIGHT / 2 })
const quiet = (work: Promise<unknown>) => void work.catch(() => {})

function readDarkTheme() {
  try { return localStorage.getItem(themeKey) === 'dark' } catch { return false }
}

export function BoardCanvas({ board }: { board: BoardDetails }) {
  const { records, status } = useQuery<NoteFields>('notes', notesQuery)
  const { records: boards } = useQuery<BoardFields>('boards', { limit: 1 })
  const { status: roomStatus, ready } = useRecordContext()
  const { userId } = useAuth()
  const { getName } = useUserLookup()
  const stopFollow = useRef(() => {})
  const view = useCanvasViewport(() => stopFollow.current())
  const actions = useBoardActions(board.id, records)
  const [editing, setEditing] = useState<string>()
  const [draft, setDraft] = useState<Draft>()
  const editingId = editing && records.some(({ recordId }) => recordId === editing) ? editing : null
  const presence = useBoardPresence(board.id, editingId)
  const { collaborators, connected, broadcast } = presence
  const session = useStudioSession({
    boardId: board.id, clockOffset: board.clockOffset ?? 0, peers: collaborators, center: view.center,
    cursor: presence.cursor, publish: presence.publish, follow: view.follow, report: actions.report,
  })
  stopFollow.current = session.stopFollowing
  const ai = useBoardFacilitator(board.id, records.length, () => session.play('chime'))
  const data = boards[0]?.data
  const studio = useMemo(() => readStudio(data), [data])
  const positions = useMemo(() => actions.notes.map(({ recordId: id, data: { x, y } }) => ({ id, x, y })), [actions.notes])
  const spatial = useSpatialTools({ positions, pointAt: view.pointAt, zoom: view.camera.zoom, perform: actions.perform, moveNotes: actions.moveNotes, broadcast, sound: session.play })
  const [pan, setPan] = useState(false)
  const [space, setSpace] = useState(false)
  const [dark, setDark] = useState(readDarkTheme)
  const [color, setColor] = useState<NoteColor>('lemon')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [topVoted, setTopVoted] = useState(false)
  const [popover, setPopover] = useState<'templates' | 'help' | 'peers'>()
  const [adding, setAdding] = useState(false)
  const createLock = useRef(false)
  const seedRetry = useRef<{ id: string; notes: ReturnType<typeof planTemplate> } | null>(null)
  const [share, setShare] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pulsed, setPulsed] = useState<string>()
  const pulseTimer = useRef<number | undefined>(undefined)
  const searchField = useRef<HTMLInputElement>(null)
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {})
  const editable = ready && roomStatus === 'connected' && status === 'ready'
  const editingAnything = Boolean(draft || editingId)
  const canChange = editable && !editingAnything && !adding && !actions.layoutBusy
  const canAdd = canChange && records.length < MAX_NOTES
  const shareUrl = new URL(boardPath(board.id), window.location.origin).href
  const linkedIds = new Set(ai.link?.noteIds)
  const counts = useMemo(() => new Map(records.map((note) => [note.recordId, readReactions(note.data.reactions).length])), [records])
  const highestCount = Math.max(0, ...counts.values())
  const term = query.trim().toLowerCase()
  const matchedCount = term ? records.filter((note) => note.data.markdown.toLowerCase().includes(term)).length : 0

  const remoteNotes = useMemo(() => {
    const map = new Map<string, Point>()
    for (const { group, dragging } of collaborators) {
      if (group) for (const point of group.notes) map.set(point.id, point)
      else if (dragging) map.set(dragging.noteId, dragging)
    }
    return map
  }, [collaborators])
  const localNotes = new Map(spatial.preview?.notes.map((point) => [point.id, point]))
  const displayed = useMemo(() => {
    const map = new Map<string, Point>(positions.map((point) => [point.id, remoteNotes.get(point.id) ?? point]))
    for (const point of spatial.preview?.notes ?? []) map.set(point.id, point)
    return map
  }, [positions, remoteNotes, spatial.preview])
  const thread = studio.edges.find(({ id }) => id === spatial.edge)
  const threadFrom = thread && displayed.get(thread.fromNoteId)
  const threadTo = thread && displayed.get(thread.toNoteId)
  const threadLabel = threadFrom && threadTo ? edgeCurve(threadFrom, threadTo).label : undefined
  const exportText = useMemo(() => ai.mode === 'export' ? buildActionBrief({
    title: board.title, notes: records, edges: studio.edges, sections: studio.sections, summary: ai.summary,
  }) : '', [ai.mode, ai.summary, board.title, records, studio.edges, studio.sections])

  useEffect(() => {
    if (userId && status === 'ready') updateRecentNoteCount(userId, board.id, records.length)
  }, [userId, board.id, status, records.length])
  useEffect(() => {
    if (searchOpen) searchField.current?.focus()
  }, [searchOpen])
  useEffect(() => () => clearTimeout(pulseTimer.current), [])

  function toggleTheme() {
    setDark(!dark)
    try { localStorage.setItem(themeKey, dark ? 'light' : 'dark') } catch { /* Optional storage. */ }
  }

  function toggleConnect() {
    spatial.clear()
    spatial.setConnect(!spatial.connect)
    setPan(false)
  }

  function setMode(mode: 'select' | 'pan') {
    spatial.setConnect(false)
    setPan(mode === 'pan')
  }

  function startDraft(point?: Point) {
    if (!canAdd) return
    const center = point ?? view.center()
    const preferred = { x: center.x - NOTE_WIDTH / 2, y: center.y - NOTE_HEIGHT / 2 }
    const next = point ? keepNoteOnCanvas(preferred) : actions.availableSpot(preferred)
    if (!next) { actions.setError('Make some space before adding a note.'); return }
    session.stopFollowing()
    setPopover(undefined)
    spatial.clear()
    setDraft({ key: crypto.randomUUID(), point: next, color })
    if (!point) view.focus(noteCenter(next))
  }

  async function createTemplate(templateId: string) {
    const template = BOARD_TEMPLATES.find(({ id }) => id === templateId)
    if (!template || !canAdd || createLock.current) return
    const retry = seedRetry.current?.id === templateId ? seedRetry.current : null
    if (!retry && records.length + template.notes.length > MAX_NOTES) { actions.setError('This template would exceed the board note limit.'); return }
    createLock.current = true
    setAdding(true)
    actions.setError('')
    try {
      const plan = retry?.notes ?? planTemplate(template, positions)
      seedRetry.current = { id: templateId, notes: plan }
      await actions.createNotes(plan)
      seedRetry.current = null
      setPopover(undefined)
      view.fit(plan)
    } catch (failure) {
      actions.report(failure)
    } finally {
      setAdding(false)
      createLock.current = false
    }
  }

  async function addGenerated(markdown: string, preferred: Point, noteColor: NoteColor, retryKey?: string) {
    if (!canAdd || createLock.current) return
    const prior = retryKey && ai.retry.current.get(retryKey)
    const point = prior ? prior.point : actions.availableSpot(preferred)
    if (!point) { actions.setError('Make some space before adding a note.'); return }
    const key = prior ? prior.key : crypto.randomUUID()
    if (retryKey) ai.retry.current.set(retryKey, { point, key })
    createLock.current = true
    setAdding(true)
    actions.setError('')
    try {
      const id = await actions.createNote({ ...point, key, markdown, color: noteColor })
      if (retryKey) ai.retry.current.delete(retryKey)
      jumpTo(id, point)
    } catch (failure) {
      actions.report(failure)
    } finally {
      setAdding(false)
      createLock.current = false
    }
  }

  async function saveDraft(markdown: string) {
    if (!draft) return
    const id = await actions.createNote({ ...draft.point, key: draft.key, markdown, color: draft.color })
    spatial.setSelection([id])
    session.play('drop')
  }

  function jumpTo(id: string, point: Point) {
    session.stopFollowing()
    setMode('select')
    spatial.setSelection([id])
    view.focus(noteCenter(point))
    view.viewport.current?.focus({ preventScroll: true })
    setPulsed(id)
    clearTimeout(pulseTimer.current)
    pulseTimer.current = window.setTimeout(() => setPulsed(undefined), 900)
  }

  function spotlight(mode: 'summary' | 'gaps', index: number | null) {
    ai.setSpotlight(index === null ? undefined : { mode, index })
    const ids = index === null ? [] : mode === 'summary' ? ai.summary?.themes[index]?.noteIds : ai.gaps?.gaps[index]?.noteIds
    const points = positions.filter(({ id }) => ids?.includes(id))
    if (points.length) { session.stopFollowing(); view.fit(points) }
  }

  async function arrange() {
    if (!canChange || !ai.summary?.themes.length) return
    const layout = layoutWithSections(positions.map(({ id }) => id), ai.summary.themes)
    if (studio.sections.length + layout.sections.length > MAX_SECTIONS) {
      actions.setError('Delete a section to make room for this layout.')
      return
    }
    await actions.moveNotes(layout.placements, layout.sections.map((section) => ({ kind: 'section.put', section })), 'theme-layout')
    ai.setSpotlight(undefined)
    session.stopFollowing()
    view.fit(layout.placements)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch {
      setShare(true)
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#spaceboard-share-link')?.select())
    }
  }

  function toggleSearch() {
    if (searchOpen) setQuery('')
    setSearchOpen(!searchOpen)
  }

  useStudioCommands(() => {
    const command = (id: string, label: string, icon: StudioCommand['icon'], run: () => void, keywords = ''): StudioCommand =>
      ({ id: 'studio-' + id, label, icon, run, keywords, group: 'Action' })
    return [
      ...(canAdd ? [command('note', 'New sticky note', Plus, () => startDraft(), 'create add')] : []),
      ...(canChange ? [
        command('section', 'Create a section frame', Frame, () => quiet(spatial.makeSection(view.center())), 'zone'),
        command('connect', 'Toggle Connect mode', Cable, toggleConnect, 'thread arrow'),
        command('template', 'Load a board template', LayoutTemplate, () => setPopover('templates'), 'kickoff retro ideation'),
        command('timer', 'Start a 5-minute brainstorm', Timer, () => void session.timerAction({ action: 'start', duration: 300 }), 'timer'),
      ] : []),
      ...(records.length ? [
        command('summary', 'AI Summarize board', Sparkles, () => { ai.open('summary'); void ai.generate('summary') }, 'theme cluster'),
        command('gaps', 'AI Find gaps', Sparkles, () => { ai.open('gaps'); void ai.generate('gaps') }, 'risks blind spots'),
      ] : []),
      command('theme', dark ? 'Switch to Lavender Studio' : 'Switch to Dark Obsidian', Moon, toggleTheme, 'light dark theme'),
      command('zen', 'Toggle Zen mode', Expand, () => session.setZen(!session.zen), 'fullscreen focus'),
      command('sound', 'Toggle sound effects', Volume2, session.toggleSound, 'mute audio'),
      command('brief', 'Export Markdown action brief', FileText, () => ai.open('export'), 'download copy'),
      command('share', 'Copy share link', Link2, () => void copyLink(), 'invite URL'),
      ...actions.notes.map((note): StudioCommand => ({
        id: 'note-' + note.recordId, group: 'Sticky note', icon: StickyNote,
        label: note.data.markdown.split('\n')[0].replace(/^#+\s*/, '').trim().slice(0, 76) || 'Sticky note',
        keywords: note.data.markdown.toLowerCase(), run: () => jumpTo(note.recordId, note.data),
      })),
    ]
  })

  useEffect(() => {
    function clearSpace() { setSpace(false) }
    function release(event: KeyboardEvent) { if (event.code === 'Space') clearSpace() }
    function press(event: KeyboardEvent) { shortcuts.current(event) }
    window.addEventListener('blur', clearSpace)
    window.addEventListener('keyup', release)
    window.addEventListener('keydown', press)
    return () => {
      window.removeEventListener('blur', clearSpace)
      window.removeEventListener('keyup', release)
      window.removeEventListener('keydown', press)
    }
  }, [])

  function handleShortcut(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.altKey || document.querySelector('[data-slot="dialog-content"][data-open]')) return
    const key = event.key.toLowerCase()
    if (event.key === 'Escape' && !editingAnything) {
      if (session.chat) session.closeChat()
      else if (session.emotesOpen) session.setEmotesOpen(false)
      else if (session.peer) session.stopFollowing()
      else { setPopover(undefined); setSearchOpen(false); setQuery(''); ai.setSpotlight(undefined); spatial.clear() }
      return
    }
    if (!(event.target instanceof Element) || event.target.closest('input, textarea, select, [contenteditable], [role="dialog"]') || editingAnything) return
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault()
      if (canChange) quiet(event.shiftKey ? actions.redo() : actions.undo())
      return
    }
    if (event.ctrlKey || event.metaKey) return
    if (key === ' ' && !event.target.closest('button, a')) { event.preventDefault(); setSpace(true); return }
    if (event.repeat) return
    if (session.emotesOpen && /^[1-6]$/.test(key)) session.sendEmote(EMOTES[Number(key) - 1])
    else if (key === 'n') startDraft()
    else if (key === 'v') setMode('select')
    else if (key === 'h') setMode('pan')
    else if (key === 'c' && canChange) toggleConnect()
    else if (key === 'f' && canChange) quiet(spatial.makeSection(view.center()))
    else if (key === 'e') session.setEmotesOpen(!session.emotesOpen)
    else if (key === 'z') session.setZen(!session.zen)
    else if (key === '/' && view.viewport.current?.contains(event.target)) session.openChat()
    else if (key === '?') setPopover((value) => value === 'help' ? undefined : 'help')
    else if (key === 'enter' && spatial.selected.length === 1 && canChange && !event.target.closest('button, a')) setEditing(spatial.selected[0].id)
    else return
    event.preventDefault()
  }
  shortcuts.current = handleShortcut

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return
    const background = !event.target.closest('.sb-studio-note, .sb-section-frame header, .sb-section-resize, .sb-edge-hit, .sb-edge-editor, .sb-selection-tools')
    if (event.button === 1 || event.button === 0 && (space || (pan || event.pointerType === 'touch') && background)) {
      session.stopFollowing()
      view.startPan(event)
    } else if (background && !editingAnything) {
      view.viewport.current?.focus({ preventScroll: true })
      if (event.button === 0) spatial.startMarquee(event)
    }
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    view.stopPan(event)
    void spatial.finish(event, commit)
  }

  function renderNote(note: Note) {
    const { recordId, data: fields } = note
    const remoteEditor = collaborators.find((peer) => peer.editingNoteId === recordId)?.name
    const linked = linkedIds.has(recordId)
    const voted = highestCount > 0 && counts.get(recordId) === highestCount
    const inSearch = !term || fields.markdown.toLowerCase().includes(term)
    return <StickyCard key={recordId} note={note} author={getName(note.createdBy) ?? 'Collaborator'}
      userId={userId ?? ''} editable={editable && !actions.layoutBusy} selected={spatial.selection.includes(recordId)}
      group={spatial.selected.length > 1} editing={editingId === recordId}
      dimmed={Boolean(ai.link && !linked || !inSearch || topVoted && highestCount && !voted)}
      highlighted={linked || Boolean(topVoted && voted) || Boolean(term && inSearch)}
      toolbarBelow={canvasToScreen(fields, view.camera).y < 36 * view.camera.zoom}
      dragPosition={localNotes.get(recordId) ?? remoteNotes.get(recordId)}
      dragState={localNotes.has(recordId) ? 'local' : remoteNotes.has(recordId) ? 'remote' : undefined}
      remoteEditor={remoteEditor} threadSource={spatial.source === recordId} threadTarget={spatial.line?.target === recordId} pulsed={pulsed === recordId}
      onSelect={(shift) => { if (!editingAnything) spatial.chooseNote(recordId, shift) }}
      onStartDrag={(event) => { if (canChange) spatial.startNote(event, recordId) }}
      onStartEdge={(event, port) => { if (canChange) spatial.startEdge(event, recordId, port) }}
      onEdit={(active) => {
        if (active && (editingAnything || spatial.connect)) return
        setEditing(active ? recordId : undefined)
        spatial.setSelection([recordId])
      }}
      onSave={(markdown) => actions.perform([{ kind: 'note.patch', id: recordId, set: { markdown } }])}
      onColor={(next) => actions.perform([{ kind: 'note.patch', id: recordId, set: { color: next } }])}
      onMove={(point) => actions.moveNotes([{ id: recordId, ...point }]).then(() => true, () => false)}
      onReact={(kind, active) => actions.reactToNote(recordId, kind, active).catch((failure) => { actions.report(failure); throw failure })}
      onDuplicate={() => void addGenerated(fields.markdown, { x: fields.x + NOTE_WIDTH + 20, y: fields.y }, fields.color)}
      onDelete={() => actions.perform([{ kind: 'note.delete', id: recordId }])} />
  }

  function updateSection(op: StudioOp) { quiet(actions.perform([op])) }

  return (
    <section aria-label={board.title} className="sb-board-frame sb-studio-frame" data-zen={session.zen}
      onPointerDownCapture={() => { if (session.sound) unlockSound() }}>
      <title>{board.title + ' | SpaceBoard'}</title>
      <header className="sb-studio-header">
        <div className="min-w-0"><Link to="/home" className="sb-board-back"><ArrowLeft size={14} /> Boards</Link><h1>{board.title}</h1></div>
        <div className="sb-studio-header-actions">
          <span role="status" className="sb-studio-status"><i data-live={editable} />{status === 'error' ? 'Sync unavailable' : editable ? 'Live' : 'Connecting…'}<span className="sb-studio-count"> · {records.length} {records.length === 1 ? 'note' : 'notes'}</span></span>
          <BoardTimer timer={studio.timer} clockOffset={session.clockOffset} disabled={!editable} onChange={(action) => void session.timerAction(action)} onFinish={() => session.play('chime')} />
          {connected && <div className="sb-peer-anchor">
            <button type="button" className="sb-peer-trigger" aria-expanded={popover === 'peers'} onClick={() => setPopover(popover === 'peers' ? undefined : 'peers')}><Users size={15} /> {collaborators.length + 1} here</button>
            {popover === 'peers' && <div className="sb-peer-list sb-hud" aria-label="Online collaborators">
              <div className="sb-peer-self"><span className="sb-peer-avatar" style={{ background: '#4f46e5' }}>Y</span>You</div>
              {collaborators.map((peer) => <button type="button" key={peer.userId} title="Follow collaborator"
                onClick={() => { session.setFollowing(peer.userId); setPopover(undefined) }}>
                <span className="sb-peer-avatar" style={{ background: peer.color }}>{peer.name.slice(0, 1).toUpperCase()}</span>{peer.name}
              </button>)}
            </div>}
          </div>}
          <Button variant="outline" size="sm" className="sb-button-secondary" aria-expanded={!!ai.mode} onClick={() => ai.open(ai.mode ? undefined : records.length ? 'summary' : 'export', true)}><Sparkles aria-hidden="true" /> Summarize board</Button>
          <Button size="sm" className="sb-button-primary" onClick={() => { setShare(true); setCopied(false) }}><Link2 aria-hidden="true" /> Share</Button>
        </div>
      </header>
      {actions.error && <div role="alert" className="sb-board-error"><span>{actions.error}</span><button type="button" aria-label="Dismiss error" onClick={() => actions.setError('')}><X size={16} /></button></div>}
      <div className="sb-studio-body" data-insights={!!ai.mode}>
        <div className="sb-studio-canvas" data-theme={dark ? 'dark' : 'lavender'} data-connect={spatial.connect}
          style={{ '--nebula-x': view.camera.x * .13 + 'px', '--nebula-y': view.camera.y * .13 + 'px' } as CSSProperties}>
          <div ref={view.viewport} className="sb-studio-viewport" aria-label="Canvas" tabIndex={0} data-pan={pan || space} data-panning={view.panning}
            onPointerDownCapture={pointerDown}
            onPointerMove={(event) => {
              if (view.panning) view.movePan(event)
              else if (!spatial.move(event) && event.pointerType !== 'touch') broadcast(view.pointAt(event.clientX, event.clientY))
            }}
            onPointerUp={(event) => finishPointer(event, true)} onPointerCancel={(event) => finishPointer(event, false)} onLostPointerCapture={(event) => finishPointer(event, false)}
            onPointerLeave={() => { if (!session.chat) broadcast(null) }}
            onDoubleClick={(event) => {
              if (spatial.connect || pan || space || !(event.target instanceof Element) || event.target.closest('.sb-studio-note, button, input, select, form, .sb-edge-hit')) return
              const point = view.pointAt(event.clientX, event.clientY)
              if (point.x >= 0 && point.y >= 0 && point.x <= CANVAS_WIDTH && point.y <= CANVAS_HEIGHT) startDraft(point)
            }}>
            <div className="sb-studio-world" style={{
              width: CANVAS_WIDTH, height: CANVAS_HEIGHT,
              transform: 'translate(' + view.camera.x + 'px,' + view.camera.y + 'px) scale(' + view.camera.zoom + ')',
            }}>
              {studio.sections.map((frame) => {
                const local = spatial.preview?.frame?.id === frame.id ? spatial.preview.frame : undefined
                const remote = collaborators.find((item) => item.group?.frame?.id === frame.id)?.group?.frame
                return <BoardSectionFrame key={frame.id} frame={local ?? remote ?? frame} remote={!!remote && !local} disabled={!editable || editingAnything}
                  onGesture={(event, resize) => { if (canChange) spatial.startFrame(event, frame, resize) }}
                  onChange={(section) => updateSection({ kind: 'section.put', section })}
                  onDelete={() => updateSection({ kind: 'section.delete', id: frame.id })} />
              })}
              <BoardEdgesLayer edges={studio.edges} positions={displayed} selected={spatial.edge} onSelect={spatial.selectEdge} preview={spatial.line?.path} />
              {actions.notes.map(renderNote)}
              {spatial.marquee && <div className="sb-marquee" style={{ left: spatial.marquee.x, top: spatial.marquee.y, width: spatial.marquee.width, height: spatial.marquee.height }} />}
              {spatial.guides.x !== undefined && <i className="sb-guide-x" style={{ left: spatial.guides.x }} />}
              {spatial.guides.y !== undefined && <i className="sb-guide-y" style={{ top: spatial.guides.y }} />}
              {canChange && spatial.selected.length > 1 && spatial.bounds && !spatial.active && <SelectionToolbar count={spatial.selected.length} bounds={spatial.bounds}
                onColor={(next) => quiet(spatial.batchColor(next))} onAlign={(mode) => quiet(spatial.moveSelection(mode))}
                onWrap={() => quiet(spatial.makeSection(view.center(), true))} onDelete={() => quiet(spatial.deleteSelection())} />}
              {canChange && thread && threadLabel && <EdgeEditor key={thread.id} edge={thread} point={threadLabel}
                onEdit={(changes) => spatial.updateEdge(thread, changes)} onClose={() => spatial.selectEdge(undefined)}
                onDelete={() => quiet(actions.perform([{ kind: 'edge.delete', id: thread.id }]).then(() => spatial.selectEdge(undefined)))} />}
              {draft && <div className="sb-studio-note sb-draft-note" style={{ left: draft.point.x, top: draft.point.y, width: NOTE_WIDTH }}>
                <div className={'sb-note-sheet sb-paper-' + draft.color}>
                  <div className="sb-draft-heading"><strong>New note</strong><ColorSwatches value={draft.color} onChange={(next) => setDraft({ ...draft, color: next })} /></div>
                  <NoteComposer key={draft.key} initial="" isNew onClose={() => { setDraft(undefined); view.viewport.current?.focus({ preventScroll: true }) }} onSave={saveDraft} />
                </div>
              </div>}
              {collaborators.map(({ userId: id, cursor, name, color: peerColor, chat }) => cursor && <div key={id} aria-hidden="true" className="sb-studio-cursor" style={{
                color: peerColor, transform: 'translate(' + cursor.x + 'px,' + cursor.y + 'px) scale(' + 1 / view.camera.zoom + ')',
              }}><MousePointer2 size={18} fill="currentColor" /><span style={{ background: peerColor }}>{name}</span><RemoteChat chat={chat} /></div>)}
              <EmoteBursts items={session.bursts} zoom={view.camera.zoom} />
            </div>
          </div>

          {session.chat && <CursorChat anchor={chatAnchor(canvasToScreen(session.chat, view.camera), view.size)} onText={session.chatText}
            onClose={() => { session.closeChat(); view.viewport.current?.focus({ preventScroll: true }) }} />}
          <div className="sb-studio-filters">
            {session.zen && <button type="button" className="sb-filter-chip sb-hud" onClick={() => session.setZen(false)}>Exit Zen · Z</button>}
            {session.peer && <button type="button" className="sb-filter-chip sb-hud" onClick={session.stopFollowing}>Following {session.peer.name} <span>· Click or pan to stop</span></button>}
            {spatial.connect && <button type="button" className="sb-filter-chip sb-hud" onClick={toggleConnect}>{spatial.source ? 'Choose the destination note' : 'Choose a note or drag from a port'} <span>· Exit Connect</span></button>}
            {searchOpen && <div className="sb-filter-chip sb-hud">
              <input ref={searchField} aria-label="Find notes on canvas" placeholder="Find notes…" value={query} onChange={(event) => setQuery(event.target.value)} />
              {term && <small>{matchedCount} found</small>}<button type="button" aria-label="Close note search" onClick={toggleSearch}><X size={14} /></button>
            </div>}
            {ai.link && <button type="button" className="sb-filter-chip sb-hud" onClick={() => ai.setSpotlight(undefined)}>Showing {ai.link.kind}: {ai.link.name} <span>· Clear</span></button>}
            {topVoted && <button type="button" className="sb-filter-chip sb-hud" onClick={() => setTopVoted(false)}>{highestCount ? 'Top voted' : 'No votes yet'} <span>· Clear</span></button>}
          </div>
          {!draft && (status !== 'ready' || !records.length && !studio.sections.length) && <div className="sb-studio-empty-wrap">
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
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={view.camera.zoom <= MIN_ZOOM} onClick={() => { session.stopFollowing(); view.zoom(view.camera.zoom - .15) }}><Minus size={16} /></button>
            <button type="button" aria-label={'Reset zoom, currently ' + Math.round(view.camera.zoom * 100) + ' percent'} title="Reset zoom" onClick={() => { session.stopFollowing(); view.zoom(1) }}>{Math.round(view.camera.zoom * 100)}%</button>
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={view.camera.zoom >= MAX_ZOOM} onClick={() => { session.stopFollowing(); view.zoom(view.camera.zoom + .15) }}><Plus size={16} /></button>
            <button type="button" aria-label="Fit to notes" title="Fit to notes" onClick={() => { session.stopFollowing(); view.fit(positions) }}><Focus size={17} /></button>
          </div>
          <CanvasMinimap notes={actions.notes} peers={collaborators} camera={view.camera} size={view.size} onJump={(point, smooth) => { session.stopFollowing(); view.focus(point, smooth) }} />
          {popover === 'help' && <StudioShortcuts onClose={() => setPopover(undefined)} />}
          {popover === 'templates' && <section className="sb-studio-popover sb-hud" aria-label="Board templates">
            <header><h2>Add template notes</h2><button type="button" aria-label="Close templates" onClick={() => setPopover(undefined)}><X size={16} /></button></header>
            {BOARD_TEMPLATES.map((template) => <button type="button" className="sb-template-menu-item" key={template.id} disabled={!canAdd}
              onClick={() => void createTemplate(template.id)}><strong>{template.title}</strong><span>{template.notes.length} notes</span></button>)}
            {adding && <p role="status">Adding notes…</p>}
          </section>}
          {session.emotesOpen && <EmoteWheel onSend={session.sendEmote} />}
          <StudioDock color={color} pan={pan} dark={dark} search={searchOpen} top={topVoted}
            canAdd={canAdd} templates={popover === 'templates'} help={popover === 'help'}
            connect={spatial.connect} zen={session.zen} sound={session.sound} canUndo={canChange && actions.canUndo} canRedo={canChange && actions.canRedo}
            onConnect={toggleConnect} onFrame={() => { if (canChange) quiet(spatial.makeSection(view.center())) }}
            onZen={() => session.setZen(!session.zen)} onSound={session.toggleSound} onEmote={() => session.setEmotesOpen(!session.emotesOpen)}
            onUndo={() => quiet(actions.undo())} onRedo={() => quiet(actions.redo())}
            onColor={setColor} onAdd={() => startDraft()} onMode={(enabled) => setMode(enabled ? 'pan' : 'select')} onTheme={toggleTheme} onSearch={toggleSearch}
            onTop={() => setTopVoted(!topVoted)} onTemplates={() => setPopover(popover === 'templates' ? undefined : 'templates')}
            onHelp={() => setPopover(popover === 'help' ? undefined : 'help')} />
        </div>
        {ai.mode && <BoardFacilitator mode={ai.mode} onMode={(mode) => ai.open(mode)} title={board.title} markdown={exportText} gaps={ai.gaps}
          activeGap={ai.spotlight?.mode === 'gaps' ? ai.spotlight.index : null} onGap={(index) => spotlight('gaps', index)}
          onGapNote={(text, index) => void addGenerated(text, view.center(), 'peach', 'gap-' + index)}
          synthesis={{
            summary: ai.summary, busy: Boolean(ai.busy), error: ai.mode === 'export' ? '' : ai.error[ai.mode] ?? '',
            theme: ai.spotlight?.mode === 'summary' ? ai.spotlight.index : null, onTheme: (index) => spotlight('summary', index),
            onClose: () => ai.open(), onGenerate: () => { if (ai.mode === 'summary' || ai.mode === 'gaps') void ai.generate(ai.mode) },
            working: !canChange, canAdd, canUndo: actions.undoLabel === 'theme-layout', canGenerate: records.length > 0,
            onAdd: (text, index) => addGenerated(text, view.center(), index % 2 ? 'mint' : 'lilac', 'step-' + index),
            onArrange: () => quiet(arrange()), onUndo: () => quiet(actions.undo()),
          }} />}
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

function chatAnchor(point: Point, size: { width: number; height: number }) {
  return { x: Math.min(Math.max(8, point.x + 13), Math.max(8, size.width - 238)), y: Math.min(Math.max(8, point.y + 13), size.height - 44) }
}
