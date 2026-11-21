import { getUserColor, usePresenceRoom } from 'deepspace'
import { useEffect, useRef } from 'react'
import { CANVAS_HEIGHT, CANVAS_WIDTH, boardIdSchema, boardRoomId, type Point } from '../schemas/board-schema'

const colors = ['#4338ca', '#047857', '#a21caf', '#b45309', '#0e7490']
type Drag = Point & { noteId: string }
export type StudioPeer = { userId: string; name: string; color: string; cursor: Point | null; dragging: Drag | null; editingNoteId: string | null }

function readPoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)) return null
  const { x, y } = value
  return typeof x === 'number' && typeof y === 'number' && x >= 0 && x <= CANVAS_WIDTH && y >= 0 && y <= CANVAS_HEIGHT ? { x, y } : null
}

function noteId(value: unknown) {
  const parsed = boardIdSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function useBoardPresence(boardId: string, editingNoteId: string | null) {
  const { peers, connected, updateState } = usePresenceRoom(boardRoomId(boardId))
  const lastSent = useRef(0)
  const lastDrag = useRef<Drag | null>(null)
  const latest = useRef(updateState)
  latest.current = updateState

  useEffect(() => {
    if (connected) latest.current({ editingNoteId, dragging: lastDrag.current })
  }, [connected, editingNoteId])

  function broadcast(cursor: Point | null, dragging?: Drag | null) {
    const force = cursor === null || dragging === null || (dragging && !lastDrag.current)
    if (dragging !== undefined) lastDrag.current = dragging
    const now = performance.now()
    if (!connected || !force && now - lastSent.current < 40) return
    lastSent.current = now
    updateState({ cursor: readPoint(cursor), ...(dragging !== undefined ? { dragging } : {}) })
  }

  const collaborators: StudioPeer[] = peers.map((peer) => {
    const raw = peer.state.dragging
    const point = readPoint(raw)
    const id = raw && typeof raw === 'object' && 'noteId' in raw ? noteId(raw.noteId) : null
    return {
      userId: peer.userId, name: peer.userName || 'Collaborator', color: getUserColor(peer.userId, colors),
      cursor: readPoint(peer.state.cursor), dragging: id && point ? { noteId: id, ...point } : null,
      editingNoteId: noteId(peer.state.editingNoteId),
    }
  })
  return { collaborators, connected, broadcast }
}
