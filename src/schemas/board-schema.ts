import type { RecordData, UserProfile } from 'deepspace'
import type { CollectionSchema } from 'deepspace/schema'

export type SpaceBoardUser = Pick<UserProfile, 'id' | 'name'>

export const BOARD_RECORD_ID = 'board'
export const NOTE_COLORS = ['lemon', 'mint', 'lilac', 'peach'] as const

export interface BoardFields {
  title: string
}

export interface NoteFields {
  markdown: string
  color: (typeof NOTE_COLORS)[number]
  x: number
  y: number
}

export type Board = RecordData<BoardFields>
export type Note = RecordData<NoteFields>

const denied = { read: false, create: false, update: false, delete: false }
const readOnly = { ...denied, read: true }

// Board writes stay closed while the schema and canvas are under review.
const permissions = { '*': denied, viewer: denied, member: readOnly, admin: readOnly }

export const boardSchemas: CollectionSchema[] = [
  {
    name: 'boards',
    columns: [
      { name: 'title', storage: 'text', interpretation: 'plain', required: true },
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
    ],
    permissions,
  },
]
