import { z } from 'zod'
import { NOTE_WIDTH, boardIdSchema, keepNoteOnCanvas, type Point } from '../schemas/board-schema'
import { NOTE_HEIGHT } from './canvas-viewport'

const nonempty = (max: number) => z.string().trim().min(1).max(max)
const insightsSchema = z.object({
  summary: nonempty(1800),
  themes: z.array(z.object({
    name: nonempty(90), detail: nonempty(480), noteIds: z.array(z.string()).max(120),
  })).max(8),
  nextSteps: z.array(nonempty(320)).max(8),
})

export type Insights = z.infer<typeof insightsSchema>
export type BoardSummary = Insights & { included: number; total: number }

export function parseBoardInsights(text: string, allowedNoteIds: Iterable<string>): Insights {
  const cleaned = text.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi, '')
  const parsed = insightsSchema.parse(JSON.parse(cleaned))
  const allowed = new Set(allowedNoteIds)
  return {
    ...parsed,
    themes: parsed.themes.map((theme) => ({
      ...theme, noteIds: [...new Set(theme.noteIds.filter((id) => boardIdSchema.safeParse(id).success && allowed.has(id)))],
    })).filter((theme) => theme.noteIds.length > 0),
  }
}

export const LAYOUT_COLUMNS = 12
export const LAYOUT_ROWS = 10

export function studioSlot(column: number, row: number): Point {
  return { x: 12 + column * 267, y: 24 + row * 228 }
}

export function findFreeNoteSpot(points: Point[], preferred: Point): Point | null {
  const origin = keepNoteOnCanvas(preferred)
  const choices = [origin]
  for (let row = 0; row < LAYOUT_ROWS; row++) {
    for (let col = 0; col < LAYOUT_COLUMNS; col++) choices.push(studioSlot(col, row))
  }
  choices.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))
  return choices.find((p) => points.every((note) => Math.abs(note.x - p.x) >= NOTE_WIDTH || Math.abs(note.y - p.y) >= NOTE_HEIGHT + 8)) ?? null
}

// The first matching theme owns a note linked to several themes. At high
// density, continue within the current column to fit every note on the board.
export function clusterByTheme(noteIds: string[], themes: Pick<Insights['themes'][number], 'noteIds'>[]) {
  const unassigned = new Set(noteIds)
  const groups = themes.map(({ noteIds }) => noteIds.filter((id) => unassigned.delete(id))).filter((group) => group.length)
  if (unassigned.size) groups.push([...unassigned])
  const separateColumns = groups.reduce((sum, group) => sum + Math.ceil(group.length / LAYOUT_ROWS), 0) <= LAYOUT_COLUMNS
  let slot = 0
  return groups.flatMap((group) => {
    if (separateColumns) slot = Math.ceil(slot / LAYOUT_ROWS) * LAYOUT_ROWS
    return group.map((id) => {
      const point = studioSlot(Math.floor(slot / LAYOUT_ROWS), slot % LAYOUT_ROWS)
      slot++
      return { id, ...point }
    })
  })
}
