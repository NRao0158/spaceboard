import { z } from 'zod'
import { boardIdSchema, NOTE_WIDTH, type Point } from '../schemas/board-schema'
import { NOTE_HEIGHT } from './canvas-viewport'

export const MAX_EDGES = 200
const edgeFields = {
  id: boardIdSchema,
  fromNoteId: boardIdSchema,
  toNoteId: boardIdSchema,
  label: z.string().trim().max(48).optional(),
  style: z.enum(['solid', 'dashed']).optional(),
}
export const edgeInputSchema = z.strictObject(edgeFields).refine((edge) => edge.fromNoteId !== edge.toNoteId, 'Choose two different notes.')
export const edgeSchema = z.object({ ...edgeFields, createdBy: z.string().min(1).max(192) })
  .refine((edge) => edge.fromNoteId !== edge.toNoteId)
export const edgesSchema = z.array(edgeSchema).max(MAX_EDGES).default([])
export type BoardEdge = z.infer<typeof edgeSchema>

export function removeNoteEdges(edges: BoardEdge[], deleted: ReadonlySet<string>) {
  return edges.filter(({ fromNoteId, toNoteId }) => !deleted.has(fromNoteId) && !deleted.has(toNoteId))
}

export function validateEdge(edge: Pick<BoardEdge, 'id' | 'fromNoteId' | 'toNoteId'>, notes: ReadonlySet<string>, edges: BoardEdge[]) {
  if (edge.fromNoteId === edge.toNoteId || !notes.has(edge.fromNoteId) || !notes.has(edge.toNoteId)) return false
  return !edges.some((item) => item.id !== edge.id && item.fromNoteId === edge.fromNoteId && item.toNoteId === edge.toNoteId)
}

export const PORTS = ['top', 'right', 'bottom', 'left'] as const
export type Port = (typeof PORTS)[number]
const normals: Record<Port, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } }

export function portPoint(position: Point, port: Port): Point {
  const normal = normals[port]
  return { x: position.x + (1 + normal.x) * NOTE_WIDTH / 2, y: position.y + (1 + normal.y) * NOTE_HEIGHT / 2 }
}

export function facingPort(position: Point, toward: Point): Port {
  const x = (toward.x - position.x - NOTE_WIDTH / 2) / NOTE_WIDTH
  const y = (toward.y - position.y - NOTE_HEIGHT / 2) / NOTE_HEIGHT
  return Math.abs(x) >= Math.abs(y) ? x >= 0 ? 'right' : 'left' : y >= 0 ? 'bottom' : 'top'
}

export function connectorCurve(start: Point, end: Point, from: Port, to?: Port) {
  const a = normals[from]
  const b = to ? normals[to] : { x: -a.x, y: -a.y }
  const reach = Math.min(165, Math.max(38, Math.hypot(end.x - start.x, end.y - start.y) * .42))
  const c1 = { x: start.x + a.x * reach, y: start.y + a.y * reach }
  const c2 = { x: end.x + b.x * reach, y: end.y + b.y * reach }
  return {
    path: 'M ' + start.x + ' ' + start.y + ' C ' + c1.x + ' ' + c1.y + ', ' + c2.x + ' ' + c2.y + ', ' + end.x + ' ' + end.y,
    label: { x: (start.x + end.x + 3 * (c1.x + c2.x)) / 8, y: (start.y + end.y + 3 * (c1.y + c2.y)) / 8 },
  }
}

export function edgeCurve(from: Point, to: Point) {
  const a = facingPort(from, { x: to.x + NOTE_WIDTH / 2, y: to.y + NOTE_HEIGHT / 2 })
  const b = facingPort(to, { x: from.x + NOTE_WIDTH / 2, y: from.y + NOTE_HEIGHT / 2 })
  return connectorCurve(portPoint(from, a), portPoint(to, b), a, b)
}
