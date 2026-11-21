import { getUserColor, usePresenceRoom } from 'deepspace'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_NOTES, boardIdSchema, boardRoomId, notePositionSchema, type Point } from '../schemas/board-schema'
import { sectionSchema, type NotePosition } from './board-sections'
import type { GroupPreview } from './use-spatial-tools'

const colors = ['#4338ca', '#047857', '#a21caf', '#b45309', '#0e7490']
export const EMOTES = ['🔥', '💡', '👏', '🎉', '🚀', '❤️'] as const
export type Emote = { id: string; emoji: typeof EMOTES[number]; point: Point; updatedAt: number }
type Chat = { text: string; updatedAt: number }
type Drag = Point & { noteId: string }
export type StudioPeer = {
  userId: string; name: string; color: string; cursor: Point | null; dragging: Drag | null
  group: GroupPreview | null; editingNoteId: string | null; chat: Chat | null; emote: Emote | null
}

export function readCanvasPoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)) return null
  const { x, y } = value
  return typeof x === 'number' && typeof y === 'number' && x >= 0 && x <= CANVAS_WIDTH && y >= 0 && y <= CANVAS_HEIGHT ? { x, y } : null
}

function noteId(value: unknown) {
  const parsed = boardIdSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function readGroup(value: unknown): GroupPreview | null {
  if (!value || typeof value !== 'object' || !('notes' in value) || !Array.isArray(value.notes) || value.notes.length > MAX_NOTES) return null
  const notes: NotePosition[] = []
  for (const item of value.notes) {
    if (!Array.isArray(item) || item.length !== 3) continue
    const id = noteId(item[0])
    const point = notePositionSchema.safeParse({ x: item[1], y: item[2] })
    if (id && point.success) notes.push({ id, ...point.data })
  }
  const parsed = sectionSchema.safeParse('frame' in value ? value.frame : undefined)
  return { notes, frame: parsed.success ? parsed.data : undefined }
}

function readChat(value: unknown): Chat | null {
  if (!value || typeof value !== 'object' || !('text' in value) || !('updatedAt' in value)) return null
  if (typeof value.text !== 'string' || value.text.length > 80 || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return null
  return { text: value.text, updatedAt: value.updatedAt }
}

function readEmote(value: unknown): Emote | null {
  if (!value || typeof value !== 'object' || !('id' in value) || !('emoji' in value) || !('point' in value) || !('updatedAt' in value)) return null
  const id = noteId(value.id)
  const emoji = EMOTES.find((item) => item === value.emoji)
  const point = readCanvasPoint(value.point)
  return id && emoji && point && typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? { id, emoji, point, updatedAt: value.updatedAt } : null
}

export function useBoardPresence(boardId: string, editingNoteId: string | null) {
  const { peers, connected, updateState } = usePresenceRoom(boardRoomId(boardId))
  const latest = useRef(updateState)
  const queue = useRef<Record<string, unknown>>({})
  const lastSent = useRef(0)
  const pending = useRef<number | undefined>(undefined)
  const latestCursor = useRef<Point | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const lastPublishedCursor = useRef<Point | null>(null)
  latest.current = updateState

  useEffect(() => {
    if (connected) latest.current({ editingNoteId })
  }, [connected, editingNoteId])

  useEffect(() => () => clearTimeout(pending.current), [])

  function flush() {
    pending.current = undefined
    lastSent.current = performance.now()
    if (lastPublishedCursor.current !== latestCursor.current) {
      lastPublishedCursor.current = latestCursor.current
      setCursor(latestCursor.current)
    }
    if (connected && Object.keys(queue.current).length) latest.current(queue.current)
    queue.current = {}
  }

  function publish(data: Record<string, unknown>, immediate = false) {
    Object.assign(queue.current, data)
    const wait = Math.max(0, 44 - (performance.now() - lastSent.current))
    if (immediate || wait === 0) {
      clearTimeout(pending.current)
      flush()
    } else if (pending.current === undefined) {
      pending.current = window.setTimeout(flush, wait)
    }
  }

  function broadcast(point: Point | null, preview?: GroupPreview | null) {
    latestCursor.current = readCanvasPoint(point)
    const payload: Record<string, unknown> = { cursor: latestCursor.current }
    if (preview !== undefined) {
      // Tuples keep a full-board group preview under PresenceRoom's 16 KiB limit.
      payload.dragGroup = preview ? { notes: preview.notes.map(({ id, x, y }) => [id, x, y]), frame: preview.frame } : null
      const sole = preview?.notes.length === 1 && preview.notes[0]
      payload.dragging = sole ? { noteId: sole.id, x: sole.x, y: sole.y } : null
    }
    publish(payload, preview === null)
  }

  const collaborators = useMemo<StudioPeer[]>(() => peers.map((peer) => {
    const raw = peer.state.dragging
    const point = readCanvasPoint(raw)
    const id = raw && typeof raw === 'object' && 'noteId' in raw ? noteId(raw.noteId) : null
    return {
      userId: peer.userId, name: peer.userName || 'Collaborator', color: getUserColor(peer.userId, colors),
      cursor: readCanvasPoint(peer.state.cursor), dragging: id && point ? { noteId: id, ...point } : null,
      editingNoteId: noteId(peer.state.editingNoteId), group: readGroup(peer.state.dragGroup),
      chat: readChat(peer.state.cursorChat), emote: readEmote(peer.state.emote),
    }
  }), [peers])

  return { collaborators, connected, broadcast, publish, cursor, latestCursor }
}
