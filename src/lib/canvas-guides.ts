import { CANVAS_WIDTH, CANVAS_HEIGHT, NOTE_WIDTH, NOTE_TOP_LIMIT, type Point } from '../schemas/board-schema'
import { NOTE_HEIGHT } from './canvas-viewport'
import type { NotePosition, Rect } from './board-sections'

export type Guides = { x?: number; y?: number }

function nearestAxis(moving: number, stationary: number[], span: number, tolerance: number) {
  const stops = [0, span / 2, span]
  let winner: { delta: number; coordinate: number } | undefined
  for (const other of stationary) for (const a of stops) for (const b of stops) {
    const coordinate = other + b
    const delta = coordinate - moving - a
    if (Math.abs(delta) <= tolerance && (!winner || Math.abs(delta) < Math.abs(winner.delta))) winner = { delta, coordinate }
  }
  return winner
}

export function snapAlignment(point: Point, others: Point[], tolerance = 8) {
  const x = nearestAxis(point.x, others.map((p) => p.x), NOTE_WIDTH, tolerance)
  const y = nearestAxis(point.y, others.map((p) => p.y), NOTE_HEIGHT, tolerance)
  return { point: { x: point.x + (x?.delta ?? 0), y: point.y + (y?.delta ?? 0) }, guides: { x: x?.coordinate, y: y?.coordinate } }
}

export function constrainGroupDelta(notes: Point[], delta: Point, frame?: Rect): Point {
  const xMin = Math.max(...notes.map((p) => -p.x), frame ? -frame.x : -Infinity)
  const yMin = Math.max(...notes.map((p) => -p.y), frame ? -frame.y : -Infinity)
  const xMax = Math.min(...notes.map((p) => CANVAS_WIDTH - NOTE_WIDTH - p.x), frame ? CANVAS_WIDTH - frame.x - frame.width : Infinity)
  const yMax = Math.min(...notes.map((p) => NOTE_TOP_LIMIT - p.y), frame ? CANVAS_HEIGHT - frame.y - frame.height : Infinity)
  return { x: Math.round(Math.max(xMin, Math.min(xMax, delta.x))), y: Math.round(Math.max(yMin, Math.min(yMax, delta.y))) }
}

export function marqueeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export function intersectingNotes(area: Rect, notes: NotePosition[]) {
  return notes.filter(({ x, y }) => x <= area.x + area.width && x + NOTE_WIDTH >= area.x && y <= area.y + area.height && y + NOTE_HEIGHT >= area.y)
    .map(({ id }) => id)
}

export function alignNotes(notes: NotePosition[], mode: 'left' | 'top' | 'tidy') {
  const x = Math.min(...notes.map((p) => p.x))
  const y = Math.min(...notes.map((p) => p.y))
  if (mode !== 'tidy') return notes.map((note) => ({ ...note, ...(mode === 'left' ? { x } : { y }) }))
  const rowsAvailable = Math.floor(NOTE_TOP_LIMIT / 228) + 1
  const columns = Math.max(Math.ceil(notes.length / rowsAvailable), Math.min(12, Math.ceil(Math.sqrt(notes.length))))
  const rows = Math.ceil(notes.length / columns)
  const startX = Math.min(x, CANVAS_WIDTH - NOTE_WIDTH - (columns - 1) * 267)
  const startY = Math.min(y, NOTE_TOP_LIMIT - (rows - 1) * 228)
  return [...notes].sort((a, b) => a.y - b.y || a.x - b.x).map(({ id }, index) => ({
    id, x: startX + index % columns * 267, y: startY + Math.floor(index / columns) * 228,
  }))
}
