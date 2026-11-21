import { z } from 'zod'
import { boardIdSchema, MAX_NOTES, notePositionSchema, noteTextSchema, type BoardFields } from '../schemas/board-schema'
import { edgeInputSchema, edgesSchema } from './board-edges'
import { sectionSchema, sectionsSchema } from './board-sections'
import { idleTimer, timerSchema } from './board-timer'

function decode(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return undefined
  try { return JSON.parse(value) } catch { return undefined }
}

export function readStudio(data?: Partial<BoardFields>) {
  return {
    edges: edgesSchema.catch([]).parse(decode(data?.edges)),
    sections: sectionsSchema.catch([]).parse(decode(data?.sections)),
    timer: timerSchema.default(idleTimer).catch(idleTimer).parse(decode(data?.timer)),
  }
}

const id = boardIdSchema
const noteChanges = z.union([
  notePositionSchema, noteTextSchema.pick({ markdown: true }), noteTextSchema.pick({ color: true }),
])
export const studioOp = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('note.patch'), id, set: noteChanges, expect: noteChanges.optional() }),
  z.strictObject({ kind: z.literal('note.delete'), id }),
  z.strictObject({ kind: z.literal('note.restore'), id, receipt: id }),
  z.strictObject({ kind: z.literal('edge.put'), edge: edgeInputSchema }),
  z.strictObject({ kind: z.literal('edge.delete'), id }),
  z.strictObject({ kind: z.literal('section.put'), section: sectionSchema }),
  z.strictObject({ kind: z.literal('section.delete'), id }),
])
export type StudioOp = z.infer<typeof studioOp>
export const studioBatch = z.strictObject({ ops: z.array(studioOp).min(1).max(MAX_NOTES + 24) })
export type StudioResult = { inverse: StudioOp[] }
