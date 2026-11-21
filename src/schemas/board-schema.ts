import type { RecordData } from 'deepspace'
import type { CollectionSchema } from 'deepspace/schema'
import { z } from 'zod'

export const BOARD_RECORD_ID = 'board'
export const NOTE_COLORS = ['lemon', 'mint', 'lilac', 'peach'] as const
export const MAX_BOARD_TITLE = 80
export const MAX_NOTE_LENGTH = 2000
export const MAX_NOTES = 120
export const CANVAS_WIDTH = 3200
export const CANVAS_HEIGHT = 2400
export const NOTE_WIDTH = 248
export const NOTE_TOP_LIMIT = CANVAS_HEIGHT - 300

export const boardIdSchema = z.uuidv4()
export const boardTitleSchema = z.string().trim().min(1).max(MAX_BOARD_TITLE)
export const noteTextSchema = z.object({
  markdown: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
  color: z.enum(NOTE_COLORS),
}).strict()
export const notePositionSchema = z.object({
  x: z.number().int().min(0).max(CANVAS_WIDTH - NOTE_WIDTH),
  y: z.number().int().min(0).max(NOTE_TOP_LIMIT),
}).strict()
export const noteFieldsSchema = noteTextSchema.extend(notePositionSchema.shape)

export type BoardFields = { title: string; edges?: string; sections?: string; timer?: string }
export type NoteFields = z.infer<typeof noteFieldsSchema> & { reactions?: string }
export type Note = RecordData<NoteFields>
export type Point = z.infer<typeof notePositionSchema>
export type BoardDetails = { id: string; title: string; serverNow?: number; clockOffset?: number }

export function boardRoomId(boardId: string) {
  return 'board:' + boardId
}

export function boardIdFromPath(path: string): string | null {
  const prefix = '/boards/'
  if (!path.startsWith(prefix)) return null
  const id = path.slice(prefix.length).replace(/\/$/, '')
  return boardIdSchema.safeParse(id).success ? id.toLowerCase() : null
}

export function keepNoteOnCanvas({ x, y }: Point): Point {
  return {
    x: Math.round(Math.min(CANVAS_WIDTH - NOTE_WIDTH, Math.max(0, x))),
    y: Math.round(Math.min(NOTE_TOP_LIMIT, Math.max(0, y))),
  }
}

const denied = { read: false, create: false, update: false, delete: false }
const readOnly = { ...denied, read: true }

// WebSocket joins are verified by the Worker. Writes use the validated board API.
const permissions = { '*': denied, viewer: readOnly, member: readOnly, admin: readOnly }

export const boardSchemas: CollectionSchema[] = [
  {
    name: 'boards',
    columns: [
      { name: 'title', storage: 'text', interpretation: 'plain', required: true },
      { name: 'edges', storage: 'text', interpretation: 'plain', required: false },
      { name: 'sections', storage: 'text', interpretation: 'plain', required: false },
      { name: 'timer', storage: 'text', interpretation: 'plain', required: false },
    ],
    permissions,
  },
  {
    name: 'notes',
    columns: [
      { name: 'markdown', storage: 'text', interpretation: 'plain', required: true },
      {
        name: 'color',
        storage: 'text',
        interpretation: { kind: 'select', options: [...NOTE_COLORS] },
        required: true,
      },
      { name: 'x', storage: 'number', interpretation: 'plain', required: true },
      { name: 'y', storage: 'number', interpretation: 'plain', required: true },
      { name: 'reactions', storage: 'text', interpretation: 'plain', required: false },
    ],
    permissions,
  },
]
