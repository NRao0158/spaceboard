import { useEffect, useMemo, useRef, useState } from 'react'
import { boardRequest } from './board-api'
import { findFreeNoteSpot } from './theme-layout'
import type { Reaction, ReactionKind } from './board-reactions'
import { MAX_NOTES, type Note, type NoteFields, type Point } from '../schemas/board-schema'
import type { StudioOp, StudioResult } from './board-studio'
import type { NotePosition } from './board-sections'
import { useBoardHistory } from './use-board-history'

type NewNote = Pick<NoteFields, 'markdown' | 'color'> & Point & { key: string }

export function useBoardActions(boardId: string, records: Note[]) {
  const path = '/' + boardId + '/notes'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Record<string, Point>>({})
  const latest = useRef(records)
  const loggedCreates = useRef(new Set<string>())
  const created = useRef(new Map<string, Point>())
  const expiry = useRef(new Map<string, number>())
  latest.current = records

  useEffect(() => {
    const timers = expiry.current
    return () => timers.forEach((timer) => clearTimeout(timer))
  }, [])

  useEffect(() => {
    for (const note of records) created.current.delete(note.recordId)
    setPending((previous) => {
      const old = Object.entries(previous)
      const left = old.filter(([id, point]) => {
        const matched = records.find((n) => n.recordId === id)
        return matched && (matched.data.x !== point.x || matched.data.y !== point.y)
      })
      return left.length === old.length ? previous : Object.fromEntries(left)
    })
  }, [records])

  const notes = useMemo(() => records.map((record) => pending[record.recordId] ? {
    ...record, data: { ...record.data, ...pending[record.recordId] },
  } : record), [records, pending])

  function report(failure: unknown) {
    setError(failure instanceof Error ? failure.message : 'Could not complete the board action.')
  }

  function availableSpot(preferred: Point) {
    if (notes.length + created.current.size >= MAX_NOTES) return null
    return findFreeNoteSpot([...notes.map(({ data }) => data), ...created.current.values()], preferred)
  }

  function clearPosition(id: string, point: Point) {
    setPending((old) => {
      if (old[id] !== point) return old
      const next = { ...old }
      delete next[id]
      return next
    })
  }

  async function send(ops: StudioOp[]) {
    setBusy(true)
    setError('')
    const moving: [string, Point][] = ops.flatMap((op) => op.kind === 'note.patch' && 'x' in op.set ? [[op.id, op.set]] : [])
    if (moving.length) setPending((old) => ({ ...old, ...Object.fromEntries(moving) }))
    try {
      const { inverse } = await boardRequest<StudioResult>('/' + boardId + '/studio', { method: 'POST', data: { ops } })
      for (const [id, point] of moving) {
        clearTimeout(expiry.current.get(id))
        expiry.current.set(id, window.setTimeout(() => { expiry.current.delete(id); clearPosition(id, point) }, 1100))
      }
      return inverse
    } catch (failure) {
      for (const [id, point] of moving) clearPosition(id, point)
      report(failure)
      throw failure
    } finally {
      setBusy(false)
    }
  }

  const history = useBoardHistory(send)

  function createNote(data: NewNote) {
    return history.enqueue(async () => {
      const result = await boardRequest<{ id: string }>(path, { method: 'POST', data })
      if (!latest.current.some((note) => note.recordId === result.id)) created.current.set(result.id, { x: data.x, y: data.y })
      if (!loggedCreates.current.has(result.id)) {
        loggedCreates.current.add(result.id)
        history.record([{ kind: 'note.delete', id: result.id }])
      }
      return result.id
    })
  }

  async function createNotes(items: NewNote[]) {
    for (const item of items) await createNote(item)
  }

  async function reactToNote(id: string, kind: ReactionKind, active: boolean) {
    const result = await boardRequest<{ reactions: Reaction[] }>(path + '/' + id + '/reaction', { method: 'PUT', data: { kind, active } })
    return result.reactions
  }

  function moveNotes(points: NotePosition[], extra: StudioOp[] = [], label?: string) {
    const moves: StudioOp[] = points.map(({ id, x, y }) => ({ kind: 'note.patch', id, set: { x, y } }))
    return history.perform([...moves, ...extra], label)
  }

  return {
    notes, error, setError, report, availableSpot, createNote, createNotes, reactToNote, moveNotes,
    perform: history.perform, undo: () => history.step('undo'), redo: () => history.step('redo'),
    canUndo: history.canUndo, undoLabel: history.undoLabel, canRedo: history.canRedo, layoutBusy: busy,
  }
}
