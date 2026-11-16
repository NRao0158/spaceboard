import { useQuery, useUserLookup } from 'deepspace'
import { Link2, Plus, Sparkles, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { BOARD_RECORD_ID, type BoardFields, type Note, type NoteFields } from '@/schemas/board-schema'

const noteColors: Record<NoteFields['color'], string> = {
  lemon: 'bg-[#fff1ac]',
  mint: 'bg-[#caf0df]',
  lilac: 'bg-[#e8ddff]',
  peach: 'bg-[#ffddcc]',
}

export function BoardCanvas() {
  const boards = useQuery<BoardFields>('boards')
  const notes = useQuery<NoteFields>('notes', { orderBy: 'createdAt', orderDir: 'asc' })
  const { getName } = useUserLookup()

  if (boards.status === 'error' || notes.status === 'error') {
    return <p role="alert" className="p-6">Couldn’t load the board. Refresh to try again.</p>
  }

  if (boards.status === 'loading' || notes.status === 'loading') {
    return <p role="status" className="p-6">Loading board…</p>
  }

  const board = boards.records.find(({ recordId }) => recordId === BOARD_RECORD_ID)
  if (!board) return <p className="p-6">Board not found.</p>

  return (
    <BoardCanvasLayout
      title={board.data.title}
      notes={notes.records}
      getAuthorName={(id) => getName(id) ?? 'Unknown author'}
    />
  )
}

interface BoardCanvasLayoutProps {
  title: string
  notes?: readonly Note[]
  getAuthorName?: (id: string) => string
}

const control = 'border-slate-200 bg-white text-slate-700 shadow-none disabled:opacity-65'
const primary = 'bg-indigo-600 text-white disabled:bg-indigo-600 disabled:opacity-70'

export function BoardCanvasLayout({ title, notes = [], getAuthorName }: BoardCanvasLayoutProps) {
  return (
    <section
      aria-label={title}
      className="flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-indigo-700">SpaceBoard</p>
          <h1 className="mt-0.5 break-words text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className={control} disabled>
            <Sparkles aria-hidden="true" /> Summarize board
          </Button>
          <Button size="sm" className={primary} disabled>
            <Link2 aria-hidden="true" /> Share
          </Button>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-2 sm:px-7">
        <Button variant="outline" size="sm" className={control} disabled>
          <Plus aria-hidden="true" /> Add note
        </Button>
        <p className="text-sm tabular-nums text-slate-600">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </p>
      </div>

      <div className="relative isolate grid flex-1 overflow-auto bg-[#f8f8fc] bg-[radial-gradient(#cdd1e4_1px,transparent_1px)] bg-size-[20px_20px]">
        {notes.length === 0 ? (
          <div className="grid place-items-center p-6">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto grid size-12 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                <StickyNote className="size-6" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Start with an idea</h2>
              <p className="mb-5 mt-2 text-sm leading-relaxed text-slate-600">
                Add a sticky note to start brainstorming.
              </p>
              <Button className={primary} disabled>
                <Plus aria-hidden="true" /> Add first note
              </Button>
            </div>
          </div>
        ) : (
          notes.map(({ recordId, data, createdBy }) => (
            <article
              key={recordId}
              className={cn('absolute w-52 rounded-xl p-4 shadow-sm', noteColors[data.color])}
              style={{ left: data.x, top: data.y }}
            >
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{data.markdown}</p>
              <p className="mt-4 text-xs font-medium text-slate-700">
                {getAuthorName?.(createdBy) ?? 'Unknown author'}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
