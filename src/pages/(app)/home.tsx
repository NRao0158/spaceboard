import { AuthOverlay, useAuth } from 'deepspace'
import { ArrowRight, LayoutTemplate, Link2, Plus, StickyNote, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui'
import { Magnetic, PaperSurface } from '@/components/SurfaceEffects'
import {
  boardPath, boardRequest, readRecentBoards, rememberBoardAfterSignIn, rememberRecentBoard, removeRecentBoard, takeBoardAfterSignIn,
} from '@/lib/board-api'
import { MAX_BOARD_TITLE, boardIdFromPath, boardIdSchema, type BoardDetails } from '@/schemas/board-schema'

import { BOARD_TEMPLATES, planTemplate, seedTemplate } from '@/lib/board-templates'

const openedDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const inputStyle = 'sb-field flex-1'

export default function HomePage() {
  const { isSignedIn, userId } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const titleInput = useRef<HTMLInputElement>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  const signInButton = useRef<HTMLButtonElement>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [createError, setCreateError] = useState('')
  const [linkError, setLinkError] = useState('')
  const [busy, setBusy] = useState(false)
  const [templateBusy, setTemplateBusy] = useState<string>()
  const [templateError, setTemplateError] = useState('')
  const [removed, setRemoved] = useState<string[]>([])
  const templateAttempts = useRef(new Map<string, { key: string; notes: ReturnType<typeof planTemplate> }>())
  const creating = useRef(false)
  const createKey = useRef<string | undefined>(undefined)
  const signedIn = isSignedIn && !!userId
  const recent = userId ? readRecentBoards(userId).filter(({ id }) => !removed.includes(id)) : []

  useEffect(() => {
    if (!signedIn) return
    const id = takeBoardAfterSignIn()
    if (id) void navigate(boardPath(id), { replace: true })
  }, [signedIn, navigate])

  useEffect(() => {
    const focus = params.get('focus')
    if (focus !== 'create' && focus !== 'join') return
    const target = focus === 'join' ? linkInput.current : signedIn ? titleInput.current : signInButton.current
    if (!target) return
    // The palette closes in this navigation. Focus after its focus restoration.
    const frame = requestAnimationFrame(() => {
      target.focus()
      const remaining = new URLSearchParams(params)
      remaining.delete('focus')
      setParams(remaining, { replace: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [params, setParams, signedIn])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId || creating.current) return
    creating.current = true
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
      creating.current = false
      setBusy(false)
    }
  }

  async function createFromTemplate(template: (typeof BOARD_TEMPLATES)[number]) {
    if (!userId || !signedIn) { setShowAuth(true); return }
    if (creating.current) return
    creating.current = true
    setTemplateError('')
    setTemplateBusy(template.id)
    try {
      const attempt = templateAttempts.current.get(template.id) ?? { key: crypto.randomUUID(), notes: planTemplate(template, []) }
      templateAttempts.current.set(template.id, attempt)
      const board = await boardRequest<BoardDetails>('', { method: 'POST', data: { key: attempt.key, title: template.title } })
      await seedTemplate(board.id, attempt.notes)
      templateAttempts.current.delete(template.id)
      rememberRecentBoard(userId, { ...board, noteCount: attempt.notes.length })
      void navigate(boardPath(board.id))
    } catch (failure) {
      setTemplateError(failure instanceof Error ? failure.message : 'Could not add the template.')
    } finally {
      creating.current = false
      setTemplateBusy(undefined)
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
    <div className="sb-dashboard">
      <div className="sb-dashboard-shell">
        <div className="sb-dashboard-heading max-w-2xl">
          <div className="sb-brand-mark mb-4">
            <StickyNote className="size-6" aria-hidden="true" />
          </div>
          <h1>Your boards</h1>
          <p>Start a brainstorm or jump into one someone shared with you.</p>
        </div>

        <div className="sb-dashboard-actions">
          <section className="sb-dashboard-card sb-dashboard-card--create">
            <h2 className="sb-dashboard-card-heading"><Plus size={19} aria-hidden="true" /> Create a board</h2>
            {signedIn ? (
              <form onSubmit={create} className="mt-3">
                <label htmlFor="board-title" className="mb-1 block text-sm font-medium text-slate-700">Board name</label>
                <div className="flex flex-wrap gap-2">
                  <input ref={titleInput} id="board-title" className={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project kickoff" maxLength={MAX_BOARD_TITLE} required />
                  <Magnetic>
                    <Button className="sb-button-primary" loading={busy} disabled={!title.trim() || !!templateBusy} type="submit">
                      <Plus aria-hidden="true" /> Create
                    </Button>
                  </Magnetic>
                </div>
                {createError && <p role="alert" className="mt-3 text-sm text-rose-700">{createError}</p>}
              </form>
            ) : (
              <Button ref={signInButton} className="sb-button-primary mt-4" onClick={() => setShowAuth(true)}>
                Sign in to get started
              </Button>
            )}
          </section>
          <section className="sb-dashboard-card">
            <h2 className="sb-dashboard-card-heading"><Link2 size={19} aria-hidden="true" /> Open a shared board</h2>
            <form onSubmit={openLink} className="mt-3">
              <label htmlFor="board-link" className="mb-1 block text-sm font-medium text-slate-700">Board link</label>
              <div className="flex flex-wrap gap-2">
                <input ref={linkInput} id="board-link" className={inputStyle} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a board link" required />
                <Button variant="outline" className="sb-button-secondary" type="submit"><Link2 aria-hidden="true" /> Open</Button>
              </div>
              {linkError && <p role="alert" className="mt-3 text-sm text-rose-700">{linkError}</p>}
            </form>
          </section>
        </div>

        <section className="sb-workspace-templates" aria-labelledby="templates-title">
          <h2 id="templates-title"><LayoutTemplate size={19} /> Start from a template</h2>
          <div className="sb-template-grid">
            {BOARD_TEMPLATES.map((template) => (
              <button className="sb-template-card" data-template={template.id} type="button" key={template.id} disabled={busy || !!templateBusy}
                onClick={() => void createFromTemplate(template)}>
                <span className="sb-template-art" aria-hidden="true"><i /><i /><i /></span>
                <span className="sb-template-copy"><strong>{template.title}</strong><span>{templateBusy === template.id ? 'Creating board…' : template.description}</span></span>
                <ArrowRight size={17} className="sb-template-arrow" aria-hidden="true" />
                <span className="sr-only">{template.notes.length} starter notes</span>
              </button>
            ))}
          </div>
          {templateError && <p role="alert" className="mt-3 text-sm text-rose-700">{templateError} Click the template again to retry.</p>}
        </section>

        {recent.length > 0 && (
          <section className="mt-10" aria-labelledby="recent-title">
            <h2 id="recent-title" className="mb-3 text-lg font-semibold">Recent on this device</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {recent.map(({ id, title, noteCount, openedAt }) => (
                <li key={id}>
                  <PaperSurface className="sb-recent-card">
                    <Link to={boardPath(id)} className="sb-recent-link">
                      <span className="sb-recent-icon"><StickyNote size={17} aria-hidden="true" /></span>
                      <span className="sb-recent-text"><strong>{title}</strong><small>
                        {noteCount === undefined ? 'Note count unavailable' : noteCount + (noteCount === 1 ? ' note' : ' notes')}
                        {openedAt !== undefined && <time dateTime={new Date(openedAt).toISOString()}> · Opened {openedDate.format(openedAt)}</time>}
                      </small></span>
                      <ArrowRight className="size-4 shrink-0 text-indigo-700" aria-hidden="true" />
                    </Link>
                    <button type="button" className="sb-recent-remove" aria-label={'Remove ' + title + ' from recent boards'} title="Remove from recent"
                      onClick={() => {
                        if (!userId) return
                        removeRecentBoard(userId, id)
                        setRemoved((current) => [...current, id])
                      }}><X size={17} /></button>
                  </PaperSurface>
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
