import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { connectorCurve, facingPort, portPoint, type BoardEdge, type Port } from './board-edges'
import { boundingNotes, insideSection, resizeSection, wrapSection, type BoardSection, type NotePosition, type Rect } from './board-sections'
import { alignNotes, constrainGroupDelta, intersectingNotes, marqueeRect, snapAlignment, type Guides } from './canvas-guides'
import type { StudioOp } from './board-studio'
import type { Point } from '../schemas/board-schema'

export type GroupPreview = { notes: NotePosition[]; frame?: BoardSection }
type Gesture =
  | { kind: 'marquee'; start: Point; original: string[]; shift: boolean }
  | { kind: 'move'; start: Point; members: NotePosition[]; primary?: NotePosition; frame?: BoardSection }
  | { kind: 'resize'; start: Point; frame: BoardSection }
  | { kind: 'connect'; from: string; port: Port }
type Props = {
  positions: NotePosition[]
  pointAt: (x: number, y: number) => Point
  zoom: number
  perform: (ops: StudioOp[]) => Promise<void>
  moveNotes: (positions: NotePosition[], extra?: StudioOp[]) => Promise<void>
  broadcast: (cursor: Point | null, preview?: GroupPreview | null) => void
  sound: (type: 'drop' | 'connect') => void
}

function nearestNote(points: NotePosition[], cursor: Point, source: string, tolerance: number) {
  let winner: { note: NotePosition; port: Port; score: number } | undefined
  for (const note of points) {
    if (note.id === source) continue
    const bounds = boundingNotes([note])!
    const dx = Math.max(bounds.x - cursor.x, 0, cursor.x - bounds.x - bounds.width)
    const dy = Math.max(bounds.y - cursor.y, 0, cursor.y - bounds.y - bounds.height)
    const distance = Math.hypot(dx, dy)
    const port = facingPort(note, cursor)
    const anchor = portPoint(note, port)
    const score = distance * 1000 + Math.hypot(anchor.x - cursor.x, anchor.y - cursor.y)
    if (distance <= tolerance && (!winner || score < winner.score)) winner = { note, port, score }
  }
  return winner
}

export function useSpatialTools(props: Props) {
  const [selection, setSelection] = useState<string[]>([])
  const [connect, setConnect] = useState(false)
  const [source, setSource] = useState<string>()
  const [edge, selectEdge] = useState<string>()
  const [marquee, setMarquee] = useState<Rect>()
  const [guides, setGuides] = useState<Guides>({})
  const [preview, setPreview] = useState<GroupPreview>()
  const [line, setLine] = useState<{ path: string; target?: string }>()
  const [active, setActive] = useState(false)
  const gesture = useRef<Gesture | null>(null)
  const settling = useRef(false)
  const pointer = useRef<number | undefined>(undefined)
  const last = useRef<GroupPreview | undefined>(undefined)
  const hit = useRef<string | undefined>(undefined)
  const moved = useRef(false)
  const frame = useRef(0)
  const sample = useRef<{ point: Point; alt: boolean } | undefined>(undefined)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  function chooseNote(id: string, shift = false) {
    selectEdge(undefined)
    if (connect) {
      if (source && source !== id) void createEdge(source, id)
      else setSource(source === id ? undefined : id)
      return
    }
    setSelection((old) => shift ? old.includes(id) ? old.filter((item) => item !== id) : [...old, id] : [id])
  }

  function clear() {
    setSelection([])
    setSource(undefined)
    selectEdge(undefined)
    setLine(undefined)
  }

  async function createEdge(from: string, to: string) {
    const item = { id: crypto.randomUUID(), fromNoteId: from, toNoteId: to }
    try {
      await props.perform([{ kind: 'edge.put', edge: item }])
      selectEdge(undefined)
      setSource(undefined)
      props.sound('connect')
    } catch { /* Board status shows the request error. */ }
  }

  function begin(event: PointerEvent<HTMLElement>, next: Gesture) {
    if (event.button !== 0 || gesture.current || settling.current) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = next
    pointer.current = event.pointerId
    last.current = undefined
    hit.current = undefined
    moved.current = false
    setActive(true)
  }

  function startMarquee(event: PointerEvent<HTMLElement>) {
    if (connect) { setSource(undefined); return }
    begin(event, { kind: 'marquee', start: props.pointAt(event.clientX, event.clientY), original: selection, shift: event.shiftKey })
  }

  function startNote(event: PointerEvent<HTMLElement>, id: string) {
    const primary = props.positions.find((note) => note.id === id)
    if (!primary) return
    if (connect) { chooseNote(id); return }
    const members = selection.includes(id) ? props.positions.filter((note) => selection.includes(note.id)) : [primary]
    if (!selection.includes(id)) setSelection([id])
    selectEdge(undefined)
    begin(event, { kind: 'move', start: props.pointAt(event.clientX, event.clientY), primary, members })
  }

  function startFrame(event: PointerEvent<HTMLElement>, section: BoardSection, resize: boolean) {
    const start = props.pointAt(event.clientX, event.clientY)
    begin(event, resize ? { kind: 'resize', start, frame: section } :
      { kind: 'move', start, frame: section, members: props.positions.filter((note) => insideSection(section, note)) })
  }

  function startEdge(event: PointerEvent<HTMLElement>, id: string, port: Port) {
    if (event.button !== 0) return
    setSource(id)
    begin(event, { kind: 'connect', from: id, port })
  }

  function update(point: Point, alt: boolean) {
    const drag = gesture.current
    if (!drag) return
    const { positions, zoom, broadcast } = latest.current
    if (drag.kind === 'connect') {
      const from = positions.find(({ id }) => id === drag.from)
      if (!from) return
      const target = nearestNote(positions, point, drag.from, 29 / zoom)
      hit.current = target?.note.id
      const end = target ? portPoint(target.note, target.port) : point
      setLine({ ...connectorCurve(portPoint(from, drag.port), end, drag.port, target?.port), target: hit.current })
      broadcast(point)
      return
    }
    const delta = { x: point.x - drag.start.x, y: point.y - drag.start.y }
    if (!moved.current && Math.hypot(delta.x, delta.y) < 4 / zoom) return
    moved.current = true
    if (drag.kind === 'marquee') {
      const area = marqueeRect(drag.start, point)
      const selected = intersectingNotes(area, positions)
      setMarquee(area)
      setSelection(drag.shift ? [...new Set([...drag.original, ...selected])] : selected)
      return
    }
    if (drag.kind === 'resize') {
      const next = { notes: [], frame: resizeSection(drag.frame, delta) }
      last.current = next
      setPreview(next)
      broadcast(point, next)
      return
    }
    const members = new Set(drag.members.map(({ id }) => id))
    const proposed = drag.primary && { x: drag.primary.x + delta.x, y: drag.primary.y + delta.y }
    const snap = proposed && !alt ? snapAlignment(proposed, positions.filter(({ id }) => !members.has(id)), 8 / zoom) : undefined
    const snapped = drag.primary && snap ? { x: snap.point.x - drag.primary.x, y: snap.point.y - drag.primary.y } : delta
    const offset = constrainGroupDelta(drag.members, snapped, drag.frame)
    setGuides(snap && Math.abs(offset.x - snapped.x) < 1 && Math.abs(offset.y - snapped.y) < 1 ? snap.guides : {})
    const next = {
      notes: drag.members.map((note) => ({ ...note, x: note.x + offset.x, y: note.y + offset.y })),
      frame: drag.frame && { ...drag.frame, x: drag.frame.x + offset.x, y: drag.frame.y + offset.y },
    }
    last.current = next
    setPreview(next)
    broadcast(point, next)
  }

  function move(event: PointerEvent<HTMLElement>) {
    if (event.pointerId !== pointer.current) return false
    sample.current = { point: props.pointAt(event.clientX, event.clientY), alt: event.altKey }
    if (!frame.current) frame.current = requestAnimationFrame(() => {
      frame.current = 0
      if (sample.current) update(sample.current.point, sample.current.alt)
    })
    return true
  }

  async function finish(event: PointerEvent<HTMLElement>, commit: boolean) {
    const drag = gesture.current
    if (!drag || event.pointerId !== pointer.current) return
    cancelAnimationFrame(frame.current)
    frame.current = 0
    sample.current = undefined
    if (commit) update(props.pointAt(event.clientX, event.clientY), event.altKey)
    const target = hit.current
    const final = last.current
    gesture.current = null
    settling.current = Boolean(final || target)
    pointer.current = undefined
    setMarquee(undefined)
    setGuides({})
    setLine(undefined)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    try {
      if (drag.kind === 'marquee') {
        if (!commit) setSelection(drag.original)
        else if (!moved.current && !drag.shift) clear()
      }
      if (drag.kind === 'connect' && target && commit) await createEdge(drag.from, target)
      if (drag.kind === 'connect' && (!commit || !target)) setSource(undefined)
      if (final && commit) {
        await props.moveNotes(final.notes, final.frame ? [{ kind: 'section.put', section: final.frame }] : [])
        props.sound('drop')
      }
    } catch { /* Failed batches leave the previous synced arrangement visible. */ }
    finally {
      if (final) props.broadcast(null, null)
      settling.current = false
      setPreview(undefined)
      setActive(false)
    }
  }

  const selected = props.positions.filter(({ id }) => selection.includes(id))
  const bounds = boundingNotes(selected)
  function makeSection(center: Point, wrap = false) {
    const region = wrap && bounds ? bounds : { x: center.x - 230, y: center.y - 150, width: 460, height: 300 }
    return props.perform([{ kind: 'section.put', section: wrapSection(region) }])
  }

  function batchColor(color: 'lemon' | 'mint' | 'lilac' | 'peach') {
    return props.perform(selected.map(({ id }) => ({ kind: 'note.patch', id, set: { color } })))
  }

  function moveSelection(mode: 'left' | 'top' | 'tidy') {
    return props.moveNotes(alignNotes(selected, mode))
  }

  function deleteSelection() {
    return props.perform(selected.map(({ id }) => ({ kind: 'note.delete', id }))).then(clear)
  }

  function updateEdge(item: BoardEdge, changes: Pick<BoardEdge, 'label' | 'style'>) {
    const { createdBy: _author, ...input } = item
    return props.perform([{ kind: 'edge.put', edge: { ...input, ...changes } }])
  }

  return {
    selected, selection, bounds, chooseNote, setSelection, connect, setConnect, source, clear, edge, selectEdge, preview, line, active, marquee, guides,
    startMarquee, startNote, startFrame, startEdge, move, finish, makeSection, batchColor, moveSelection, deleteSelection, updateEdge,
  }
}
