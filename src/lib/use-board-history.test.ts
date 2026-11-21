import { expect, it } from 'vitest'
import { advanceHistory, emptyHistory } from './use-board-history'
import type { StudioOp } from './board-studio'

const deleted: StudioOp[] = [{ kind: 'note.delete', id: 'note' }]
const restore: StudioOp[] = [{ kind: 'note.restore', id: 'note', receipt: 'receipt' }]
const move: StudioOp[] = [{ kind: 'note.patch', id: 'note', set: { x: 1, y: 2 }, expect: { x: 8, y: 9 } }]
const moveBack: StudioOp[] = [{ kind: 'note.patch', id: 'note', set: { x: 8, y: 9 }, expect: { x: 1, y: 2 } }]

it('moves acknowledged inverses to the opposite stack and discards redo after a new edit', () => {
  let history = advanceHistory(advanceHistory(emptyHistory, 'edit', deleted), 'edit', move)
  history = advanceHistory(history, 'undo', moveBack)
  history = advanceHistory(history, 'undo', restore)
  expect(history).toEqual({ undo: [], redo: [moveBack, restore] })
  history = advanceHistory(history, 'redo', deleted)
  expect(history).toEqual({ undo: [deleted], redo: [moveBack] })
  expect(advanceHistory(history, 'edit', move)).toEqual({ undo: [deleted, move], redo: [] })
})

it('retains the 30 most recent successful changes', () => {
  const history = Array.from({ length: 36 }).reduce<ReturnType<typeof advanceHistory>>((stack) => advanceHistory(stack, 'edit', deleted), emptyHistory)
  expect(history.undo).toHaveLength(30)
})
