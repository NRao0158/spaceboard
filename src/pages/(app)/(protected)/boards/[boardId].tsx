import { RecordScope, useAuth } from 'deepspace'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BoardCanvas } from '@/components/BoardCanvas'
import { boardRequest, rememberRecentBoard } from '@/lib/board-api'
import { boardIdSchema, boardRoomId, boardSchemas, type BoardDetails } from '@/schemas/board-schema'

export default function BoardPage() {
  const { boardId } = useParams<'boardId'>()
  const parsed = boardIdSchema.safeParse(boardId)
  if (!parsed.success) return <BoardMessage message="Board not found." />
  const id = parsed.data.toLowerCase()
  return <OpenBoard key={id} id={id} />
}

function OpenBoard({ id }: { id: string }) {
  const { userId } = useAuth()
  const [board, setBoard] = useState<BoardDetails>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!userId) return
    const request = new AbortController()
    const started = Date.now()
    void boardRequest<BoardDetails>('/' + id, { signal: request.signal })
      .then((result) => {
        if (request.signal.aborted) return
        rememberRecentBoard(userId, result)
        setBoard({ ...result, clockOffset: result.serverNow ? result.serverNow - (started + Date.now()) / 2 : 0 })
      })
      .catch((failure: unknown) => {
        if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not open the board.')
      })
    return () => request.abort()
  }, [id, userId, attempt])

  if (error) return <BoardMessage message={error} retry={() => { setError(''); setAttempt((previous) => previous + 1) }} />
  if (!board) return <p role="status" className="p-8 text-sm text-slate-600">Opening board…</p>

  return (
    <div className="sb-board-page flex h-full min-h-[29rem] p-3 sm:p-5">
      <RecordScope roomId={boardRoomId(id)} schemas={boardSchemas} isolated>
        <BoardCanvas board={board} />
      </RecordScope>
    </div>
  )
}

function BoardMessage({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="grid min-h-[55vh] place-items-center bg-[#f6f6fb] px-5 text-slate-950">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">{message}</h1>
        <div className="mt-4 flex justify-center gap-4 text-sm font-semibold text-indigo-700">
          <Link to="/home" className="underline underline-offset-4">Back to boards</Link>
          {retry && <button type="button" onClick={retry} className="underline underline-offset-4">Try again</button>}
        </div>
      </div>
    </div>
  )
}
