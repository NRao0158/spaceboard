import { getAuthToken } from 'deepspace'
import { boardIdFromPath, type BoardDetails } from '@/schemas/board-schema'

export type BoardSummary = { summary: string; included: number; total: number }

export class BoardRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function boardRequest<T>(path = '', options: {
  method?: 'POST' | 'PATCH' | 'DELETE'
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

export function readRecentBoards(userId: string): BoardDetails[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(recentKey(userId)) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((board): board is BoardDetails =>
      typeof board?.id === 'string' && typeof board?.title === 'string' &&
      boardIdFromPath(boardPath(board.id)) !== null,
    ).slice(0, 8)
  } catch {
    return []
  }
}

export function rememberRecentBoard(userId: string, board: BoardDetails) {
  try {
    const recent = [board, ...readRecentBoards(userId).filter(({ id }) => id !== board.id)]
    localStorage.setItem(recentKey(userId), JSON.stringify(recent.slice(0, 8)))
  } catch {
    // Browser storage is optional. Boards are still available by their links.
  }
}
