import { getAuthToken } from 'deepspace'
import { boardIdFromPath, type BoardDetails } from '@/schemas/board-schema'

export type { BoardSummary } from './theme-layout'

export class BoardRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function boardRequest<T>(path = '', options: {
  method?: 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  data?: object
  signal?: AbortSignal
} = {}): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new BoardRequestError('Sign in to continue.', 401)
  const response = await fetch('/api/boards' + path, {
    method: options.method ?? 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(options.data && { 'Content-Type': 'application/json' }) },
    body: options.data ? JSON.stringify(options.data) : undefined,
    signal: options.signal,
    cache: 'no-store',
  })
  const result = await response.json().catch(() => null) as (T & { error?: string }) | null
  if (!response.ok || !result) {
    throw new BoardRequestError(result?.error ?? 'SpaceBoard could not complete the request. Try again.', response.status)
  }
  return result
}

export function boardPath(id: string) {
  return '/boards/' + id
}

const returnKey = 'spaceboard:return-board'
const recentKey = (userId: string) => 'spaceboard:recent:' + userId

export function rememberBoardAfterSignIn(path: string) {
  const id = boardIdFromPath(path)
  try {
    if (id) sessionStorage.setItem(returnKey, id)
  } catch {
    // A browser can block session storage. Sign-in still works from Home.
  }
}

export function takeBoardAfterSignIn() {
  try {
    const id = sessionStorage.getItem(returnKey)
    sessionStorage.removeItem(returnKey)
    return id ? boardIdFromPath(boardPath(id)) : null
  } catch {
    return null
  }
}

export type RecentBoard = BoardDetails & { openedAt?: number; noteCount?: number }

export function readRecentBoards(userId: string): RecentBoard[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(recentKey(userId)) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((board): board is RecentBoard =>
      typeof board?.id === 'string' && typeof board?.title === 'string' &&
      boardIdFromPath(boardPath(board.id)) !== null,
    ).slice(0, 8).map(({ id, title, openedAt, noteCount }) => ({
      id, title,
      openedAt: typeof openedAt === 'number' && Number.isFinite(openedAt) && openedAt >= 0 && openedAt <= Date.now() ? openedAt : undefined,
      noteCount: typeof noteCount === 'number' && Number.isInteger(noteCount) && noteCount >= 0 ? noteCount : undefined,
    }))
  } catch {
    return []
  }
}

function writeRecentBoards(userId: string, boards: RecentBoard[]) {
  try { localStorage.setItem(recentKey(userId), JSON.stringify(boards.slice(0, 8))) } catch {
    // Browser storage is optional. Boards are still available by their links.
  }
}

export function rememberRecentBoard(userId: string, board: RecentBoard) {
  const recent = readRecentBoards(userId)
  const previous = recent.find(({ id }) => id === board.id)
  writeRecentBoards(userId, [{ ...previous, ...board, openedAt: Date.now() }, ...recent.filter(({ id }) => id !== board.id)])
}

export function updateRecentNoteCount(userId: string, boardId: string, noteCount: number) {
  const recent = readRecentBoards(userId)
  if (recent.some((board) => board.id === boardId && board.noteCount !== noteCount)) {
    writeRecentBoards(userId, recent.map((board) => board.id === boardId ? { ...board, noteCount } : board))
  }
}

export function removeRecentBoard(userId: string, boardId: string) {
  writeRecentBoards(userId, readRecentBoards(userId).filter(({ id }) => id !== boardId))
}
