import { expect, it } from 'vitest'
import { edgeInputSchema, removeNoteEdges, validateEdge } from './board-edges'

const id = (end: number) => 'c6780fef-c0eb-4d11-83ab-a3fa0cbb810' + end
const a = id(1)
const b = id(2)
const c = id(3)
const edge = { id: id(4), fromNoteId: a, toNoteId: b, createdBy: 'author', label: 'leads to' }

it('rejects self loops, missing endpoints, duplicate directed pairs and client author claims', () => {
  const notes = new Set([a, b, c])
  expect(validateEdge(edge, notes, [edge])).toBe(true)
  expect(validateEdge({ ...edge, fromNoteId: b }, notes, [])).toBe(false)
  expect(validateEdge({ ...edge, toNoteId: id(9) }, notes, [])).toBe(false)
  expect(validateEdge({ ...edge, id: id(7) }, notes, [edge])).toBe(false)
  expect(edgeInputSchema.safeParse(edge).success).toBe(false)
})

it('cleans up incoming and outgoing threads while preserving unrelated edges', () => {
  const incoming = { ...edge, id: id(5), fromNoteId: c, toNoteId: a }
  const unrelated = { ...edge, id: id(6), fromNoteId: b, toNoteId: c }
  expect(removeNoteEdges([edge, incoming, unrelated], new Set([a]))).toEqual([unrelated])
})
