import { RecordScope } from 'deepspace'
import { useParams } from 'react-router-dom'
import { BoardCanvas } from '@/components/BoardCanvas'
import { boardSchemas } from '@/schemas/board-schema'

const BOARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export default function BoardPage() {
  const { boardId } = useParams<'boardId'>()

  if (!boardId || !BOARD_ID.test(boardId)) {
    return <p className="p-6">Board not found.</p>
  }

  // Each share link points at a separate Durable Object. The key resets
  // subscriptions when navigating from one board to another.
  return (
    <div className="flex min-h-full bg-slate-50 p-3 sm:p-6">
      <RecordScope key={boardId} roomId={`board:${boardId}`} schemas={boardSchemas} isolated>
        <BoardCanvas />
      </RecordScope>
    </div>
  )
}
