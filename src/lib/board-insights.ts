import { z } from 'zod'
import { boardIdSchema } from '../schemas/board-schema'
import { boundingNotes, SECTION_COLORS, wrapSection, type BoardSection } from './board-sections'
import { clusterByTheme, type Insights } from './theme-layout'

export function parseAiJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi, ''))
}

export function linkedNoteIds(ids: string[], allowed: ReadonlySet<string>) {
  return [...new Set(ids.filter((id) => boardIdSchema.safeParse(id).success && allowed.has(id)))]
}

const gap = z.object({
  title: z.string().trim().min(1).max(85),
  detail: z.string().trim().min(1).max(500),
  prompt: z.string().trim().min(1).max(320),
  noteIds: z.array(z.string()).max(120),
})
const gapsSchema = z.object({ gaps: z.array(gap).max(4) })
export type GapInsights = z.infer<typeof gapsSchema> & { included: number; total: number }

export function parseBoardGaps(text: string, noteIds: Iterable<string>) {
  const { gaps } = gapsSchema.parse(parseAiJson(text))
  const allowed = new Set(noteIds)
  return { gaps: gaps.map((item) => ({ ...item, noteIds: linkedNoteIds(item.noteIds, allowed) })).filter((item) => item.noteIds.length) }
}

export function layoutWithSections(noteIds: string[], themes: Insights['themes']) {
  const placements = clusterByTheme(noteIds, themes)
  const assigned = new Set<string>()
  const sections: BoardSection[] = []
  themes.forEach((theme, index) => {
    const points = placements.filter(({ id }) => theme.noteIds.includes(id) && !assigned.has(id))
    for (const { id } of points) assigned.add(id)
    const bounds = boundingNotes(points)
    if (!bounds) return
    const other = placements.filter((point) => !points.includes(point))
    const containsOthers = other.some(({ x, y }) => x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height)
    const color = SECTION_COLORS[index % SECTION_COLORS.length]
    if (!containsOthers) {
      sections.push(wrapSection(bounds, theme.name, color))
      return
    }
    // A full board can share columns at theme boundaries. Frame only the
    // occupied part of each column so another theme stays outside the frame.
    for (const x of new Set(points.map((point) => point.x))) {
      const column = boundingNotes(points.filter((point) => point.x === x))
      if (column) sections.push(wrapSection(column, theme.name, color))
    }
  })
  return { placements, sections }
}
