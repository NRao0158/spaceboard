import { useRef, useState } from 'react'
import type { StudioOp } from './board-studio'

export type History = { undo: StudioOp[][]; redo: StudioOp[][] }
export const emptyHistory: History = { undo: [], redo: [] }

export function advanceHistory(history: History, direction: 'edit' | 'undo' | 'redo', inverse: StudioOp[]): History {
  const append = (stack: StudioOp[][]) => inverse.length ? [...stack, inverse].slice(-30) : stack
  if (direction === 'undo') return { undo: history.undo.slice(0, -1), redo: append(history.redo) }
  if (direction === 'redo') return { undo: append(history.undo), redo: history.redo.slice(0, -1) }
  return inverse.length ? { undo: append(history.undo), redo: [] } : history
}

export function useBoardHistory(send: (ops: StudioOp[]) => Promise<StudioOp[]>) {
  const current = useRef(emptyHistory)
  const labels = useRef(new WeakMap<StudioOp[], string>())
  const tail = useRef(Promise.resolve())
  const [history, setHistory] = useState(emptyHistory)

  function record(inverse: StudioOp[], direction: 'edit' | 'undo' | 'redo' = 'edit', label?: string) {
    if (label) labels.current.set(inverse, label)
    current.current = advanceHistory(current.current, direction, inverse)
    setHistory(current.current)
  }

  function enqueue<T>(run: () => Promise<T>) {
    const next = tail.current.then(run)
    tail.current = next.then(() => undefined, () => undefined)
    return next
  }

  function perform(ops: StudioOp[], label?: string) {
    if (!ops.length) return Promise.resolve()
    return enqueue(async () => record(await send(ops), 'edit', label))
  }

  function step(direction: 'undo' | 'redo') {
    return enqueue(async () => {
      const ops = current.current[direction].at(-1)
      if (ops) record(await send(ops), direction, labels.current.get(ops))
    })
  }

  const top = history.undo.at(-1)
  return { enqueue, record, perform, step, canUndo: !!top, canRedo: history.redo.length > 0, undoLabel: top && labels.current.get(top) }
}
