import { z } from 'zod'
import { boardIdSchema, CANVAS_HEIGHT, CANVAS_WIDTH, NOTE_WIDTH, type Point } from '../schemas/board-schema'
import { NOTE_HEIGHT } from './canvas-viewport'

export const MAX_SECTIONS = 20
export const SECTION_COLORS = ['indigo', 'emerald', 'amber', 'rose'] as const
export const sectionSchema = z.strictObject({
  id: boardIdSchema,
  title: z.string().trim().min(1).max(90),
  x: z.number().int().min(0).max(CANVAS_WIDTH),
  y: z.number().int().min(0).max(CANVAS_HEIGHT),
  width: z.number().int().min(120).max(CANVAS_WIDTH),
  height: z.number().int().min(100).max(CANVAS_HEIGHT),
  color: z.enum(SECTION_COLORS),
}).refine((frame) => frame.x + frame.width <= CANVAS_WIDTH && frame.y + frame.height <= CANVAS_HEIGHT)
export const sectionsSchema = z.array(sectionSchema).max(MAX_SECTIONS).default([])
export type BoardSection = z.infer<typeof sectionSchema>
export type Rect = Point & { width: number; height: number }
export type NotePosition = Point & { id: string }
const clamp = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)))

export function insideSection(section: Rect, note: Point) {
  const x = note.x + NOTE_WIDTH / 2
  const y = note.y + NOTE_HEIGHT / 2
  return x >= section.x && x <= section.x + section.width && y >= section.y && y <= section.y + section.height
}

export function boundingNotes(notes: Point[]): Rect | null {
  if (!notes.length) return null
  const x = Math.min(...notes.map((p) => p.x))
  const y = Math.min(...notes.map((p) => p.y))
  return {
    x, y,
    width: Math.max(...notes.map((p) => p.x)) + NOTE_WIDTH - x,
    height: Math.max(...notes.map((p) => p.y)) + NOTE_HEIGHT - y,
  }
}

export function wrapSection(bounds: Rect, title = 'New section', color: BoardSection['color'] = 'indigo'): BoardSection {
  const x = clamp(bounds.x - 12, 0, CANVAS_WIDTH - 120)
  const y = clamp(bounds.y - 22, 0, CANVAS_HEIGHT - 100)
  return {
    id: crypto.randomUUID(), title, color, x, y,
    width: clamp(bounds.x + bounds.width + 12 - x, 120, CANVAS_WIDTH - x),
    height: clamp(bounds.y + bounds.height + 10 - y, 100, CANVAS_HEIGHT - y),
  }
}

export function resizeSection(section: BoardSection, delta: Point): BoardSection {
  return {
    ...section, width: clamp(section.width + delta.x, 120, CANVAS_WIDTH - section.x),
    height: clamp(section.height + delta.y, 100, CANVAS_HEIGHT - section.y),
  }
}
