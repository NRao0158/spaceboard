import { AuthOverlay, useAuth } from 'deepspace'
import { ArrowRight, Link2, Plus, StickyNote } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'
import {
  boardPath, boardRequest, readRecentBoards, rememberBoardAfterSignIn, rememberRecentBoard, takeBoardAfterSignIn,
} from '@/lib/board-api'
import { MAX_BOARD_TITLE, boardIdFromPath, boardIdSchema, type BoardDetails } from '@/schemas/board-schema'

const inputStyle = 'min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-indigo-600'

export default function HomePage() {
  const { isSignedIn, userId } = useAuth()
  const navigate = useNavigate()
  const [showAuth, setShowAuth] = useState(false)
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [createError, setCreateError] = useState('')
  const [linkError, setLinkError] = useState('')
  const [busy, setBusy] = useState(false)
  const createKey = useRef<string | undefined>(undefined)
  const signedIn = isSignedIn && !!userId
  const recent = userId ? readRecentBoards(userId) : []

  useEffect(() => {
    if (!signedIn) return
    const id = takeBoardAfterSignIn()
    if (id) void navigate(boardPath(id), { replace: true })
  }, [signedIn, navigate])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId || busy) return
    setCreateError('')
    setBusy(true)
    try {
      createKey.current ??= crypto.randomUUID()
      const board = await boardRequest<BoardDetails>('', {
        method: 'POST', data: { key: createKey.current, title },
      })
      rememberRecentBoard(userId, board)
      void navigate(boardPath(board.id))
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create a board.')
    } finally {
      setBusy(false)
    }
  }

  function openLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLinkError('')
    const value = link.trim()
    let id = boardIdSchema.safeParse(value).success ? value.toLowerCase() : boardIdFromPath(value)
    if (!id) {
      try {
        const url = new URL(value)
        if (url.origin === window.location.origin) id = boardIdFromPath(url.pathname)
      } catch {
        // A pasted value can be neither a board ID nor a URL.
      }
    }
    if (!id) {
      setLinkError('Paste a SpaceBoard link from this app.')
      return
    }
    if (!signedIn) {
      rememberBoardAfterSignIn(boardPath(id))
      setShowAuth(true)
      return
    }
    void navigate(boardPath(id))
  }

  return (
    <div className="min-h-full bg-[#f6f6fb] text-slate-950">
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-9 sm:py-16">
        <div className="mb-9 max-w-2xl">
          <div className="mb-5 grid size-12 place-items-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
            <StickyNote className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Your boards</h1>
          <p className="mt-3 text-base text-slate-600">Start a brainstorm or jump into one someone shared with you.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold">Create a board</h2>
            {signedIn ? (
              <form onSubmit={create} className="mt-3">
                <label htmlFor="board-title" className="mb-1 block text-sm font-medium text-slate-700">Board name</label>
                <div className="flex flex-wrap gap-2">
                  <input id="board-title" className={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project kickoff" maxLength={MAX_BOARD_TITLE} required />
                  <Button className="bg-indigo-700 text-white hover:bg-indigo-800" loading={busy} disabled={!title.trim()} type="submit">
                    <Plus aria-hidden="true" /> Create
                  </Button>
                </div>
                {createError && <p role="alert" className="mt-3 text-sm text-rose-700">{createError}</p>}
              </form>
            ) : (
              <Button className="mt-4 bg-indigo-700 text-white hover:bg-indigo-800" onClick={() => setShowAuth(true)}>
                Sign in to get started
              </Button>
            )}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold">Open a shared board</h2>
            <form onSubmit={openLink} className="mt-3">
              <label htmlFor="board-link" className="mb-1 block text-sm font-medium text-slate-700">Board link</label>
              <div className="flex flex-wrap gap-2">
                <input id="board-link" className={inputStyle} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a board link" required />
                <Button variant="outline" className="border-slate-300 bg-white text-slate-800" type="submit"><Link2 aria-hidden="true" /> Open</Button>
              </div>
              {linkError && <p role="alert" className="mt-3 text-sm text-rose-700">{linkError}</p>}
            </form>
          </section>
        </div>

        {recent.length > 0 && (
          <section className="mt-10" aria-labelledby="recent-title">
            <h2 id="recent-title" className="mb-3 text-lg font-semibold">Recent on this device</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {recent.map(({ id, title }) => (
                <li key={id}>
                  <Link to={boardPath(id)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-indigo-600">
                    <StickyNote className="size-5 shrink-0 text-indigo-600" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
                    <ArrowRight className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {showAuth && !signedIn && <AuthOverlay title="Sign in to SpaceBoard" description="Create a board or join one someone shared." onClose={() => setShowAuth(false)} />}
    </div>
  )
}
