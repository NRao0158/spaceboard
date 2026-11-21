import { useEffect, useRef, useState } from 'react'
import { boardRequest } from './board-api'
import { clusterByTheme, findFreeNoteSpot, type Insights } from './theme-layout'
import type { Reaction, ReactionKind } from './board-reactions'
import { MAX_NOTES, type Note, type NoteFields, type Point } from '../schemas/board-schema'

type Placement = Point & { id: string }
type NewNote = Pick<NoteFields, 'markdown' | 'color'> & Point & { key: string }

export function useBoardActions(boardId: string, records: Note[]) {
  const path = '/' + boardId + '/notes'
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Record<string, Point>>({})
  const [undo, setUndo] = useState<Placement[]>([])
  const [layoutBusy, setLayoutBusy] = useState(false)
  const layoutLock = useRef(false)
  const timers = useRef(new Map<string, number>())
  const moveQueue = useRef(new Map<string, Promise<unknown>>())
  const created = useRef(new Map<string, Point>())
  const latestRecords = useRef(records)
  latestRecords.current = records

  useEffect(() => {
    const active = timers.current
    return () => active.forEach((timer) => clearTimeout(timer))
  }, [])

  useEffect(() => {
    for (const note of records) created.current.delete(note.recordId)
    setPending((previous) => {
      const changes = Object.entries(previous)
      const remaining = changes.filter(([id, point]) => {
        const record = records.find((note) => note.recordId === id)
        return record && (record.data.x !== point.x || record.data.y !== point.y)
      })
      return remaining.length === changes.length ? previous : Object.fromEntries(remaining)
    })
  }, [records])

  const notes = records.map((record) => pending[record.recordId] ? {
    ...record, data: { ...record.data, ...pending[record.recordId] },
  } : record)

  function report(failure: unknown) {
    setError(failure instanceof Error ? failure.message : 'Could not complete the board action.')
  }

  function availableSpot(preferred: Point) {
    if (notes.length + created.current.size >= MAX_NOTES) return null
    return findFreeNoteSpot([...notes.map(({ data }) => data), ...created.current.values()], preferred)
  }

  async function createNote(data: NewNote) {
    const result = await boardRequest<{ id: string }>(path, { method: 'POST', data })
    if (!latestRecords.current.some((note) => note.recordId === result.id)) created.current.set(result.id, { x: data.x, y: data.y })
    return result.id
  }

  function patchNote(id: string, data: Partial<Pick<NoteFields, 'markdown' | 'color'>> | Point) {
    return boardRequest(path + '/' + id, { method: 'PATCH', data })
  }

  async function deleteNote(id: string) {
    await boardRequest(path + '/' + id, { method: 'DELETE' })
  }

  async function reactToNote(id: string, kind: ReactionKind, active: boolean) {
    const result = await boardRequest<{ reactions: Reaction[] }>(path + '/' + id + '/reaction', { method: 'PUT', data: { kind, active } })
    return result.reactions
  }

  function clearPending(id: string, point: Point) {
    setPending((previous) => {
      if (previous[id] !== point) return previous
      const remaining = { ...previous }
      delete remaining[id]
      return remaining
    })
  }

  async function moveNote(id: string, point: Point) {
    setPending((previous) => ({ ...previous, [id]: point }))
    const previous = moveQueue.current.get(id)
    const run = (previous ?? Promise.resolve()).catch(() => {}).then(() => patchNote(id, point))
    moveQueue.current.set(id, run)
    try {
      await run
      return true
    } catch (failure) {
      clearPending(id, point)
      report(failure)
      return false
    } finally {
      if (moveQueue.current.get(id) === run) {
        moveQueue.current.delete(id)
        clearTimeout(timers.current.get(id))
        timers.current.set(id, window.setTimeout(() => {
          timers.current.delete(id)
          clearPending(id, point)
        }, 1300))
      }
    }
  }

  async function applyPositions(placements: Placement[]) {
    const applied = new Set<string>()
    // Limit concurrent requests and retain the exact successful writes for undo.
    for (let index = 0; index < placements.length; index += 6) {
      await Promise.all(placements.slice(index, index + 6).map(async ({ id, x, y }) => {
        if (await moveNote(id, { x, y })) applied.add(id)
      }))
    }
    return applied
  }

  async function changeLayout(themes?: Insights['themes']) {
    if (layoutLock.current) return
    setError('')
    const before = notes.map(({ recordId: id, data: { x, y } }) => ({ id, x, y }))
    const live = new Map(before.map((point) => [point.id, point]))
    const placements = (themes ? clusterByTheme(before.map(({ id }) => id), themes) : undo).filter(({ id }) => live.has(id))
    const moves = placements.filter(({ id, x, y }) => live.get(id)?.x !== x || live.get(id)?.y !== y)
    if (themes && !moves.length) return
    layoutLock.current = true
    setLayoutBusy(true)
    try {
      const applied = await applyPositions(moves)
      const skipped = new Set(placements.filter(({ id }) => !moves.some((move) => move.id === id)).map(({ id }) => id))
      if (themes) {
        if (applied.size) setUndo(before.filter(({ id }) => applied.has(id)))
      } else {
        setUndo(undo.filter(({ id }) => live.has(id) && !applied.has(id) && !skipped.has(id)))
      }
      if (applied.size < moves.length) setError('Some notes could not be moved. You can retry or undo the saved moves.')
      return placements.filter(({ id }) => applied.has(id) || skipped.has(id))
    } finally {
      layoutLock.current = false
      setLayoutBusy(false)
    }
  }

  return { notes, error, setError, report, availableSpot, createNote, patchNote, deleteNote, reactToNote, moveNote, layoutBusy, changeLayout, canUndo: undo.length > 0 }
}
