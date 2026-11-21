import { useAuth } from 'deepspace'
import { ArrowRight, LayoutGrid, Link2, Plus, Search, StickyNote, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui'
import { useStudioCommandSource, type StudioCommand } from '@/lib/studio-commands'
import { boardPath, readRecentBoards } from '@/lib/board-api'

interface Command {
  id: string
  label: string
  destination: string
  keywords: string
  icon: LucideIcon
  group: 'Action' | 'Recent board' | 'Page'
}

interface NavigationItem {
  label: string
  path: string
}

const actions: Command[] = [
  { id: 'create', label: 'Create a board', destination: '/home?focus=create', keywords: 'new add start brainstorm', icon: Plus, group: 'Action' },
  { id: 'join', label: 'Open a board link', destination: '/home?focus=join', keywords: 'join paste invite shared', icon: Link2, group: 'Action' },
]

function rank(command: Command | StudioCommand, query: string) {
  if (!query) return 0
  const label = command.label.toLowerCase()
  if (label === query) return 0
  if (label.startsWith(query)) return 1
  if (label.includes(query)) return 2
  if (command.keywords.includes(query)) return 3

  let offset = 0
  for (const char of query.replace(/\s/g, '')) {
    const next = label.indexOf(char, offset)
    if (next < 0) return Infinity
    offset = next + 1
  }
  return 4 + offset / 100
}

export function CommandPalette({ navigation }: { navigation: NavigationItem[] }) {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const boardCommands = useStudioCommandSource()
  const [studio, setStudio] = useState<StudioCommand[]>([])
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [shortcut, setShortcut] = useState('Ctrl K')

  function changeOpen(next: boolean) {
    setOpen(next)
    if (next) {
      setStudio(boardCommands?.current?.() ?? [])
      setQuery('')
      setActive(0)
    }
  }

  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.platform)) setShortcut('⌘ K')
    function activate(event: globalThis.KeyboardEvent) {
      if (event.repeat || event.defaultPrevented || event.altKey || event.shiftKey) return
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return
      if (!open && document.querySelector('[role="dialog"][aria-modal="true"]')) return
      event.preventDefault()
      changeOpen(!open)
    }
    window.addEventListener('keydown', activate)
    return () => window.removeEventListener('keydown', activate)
  }, [open, boardCommands])

  const recent: Command[] = userId && open ? readRecentBoards(userId).map((board) => ({
    id: board.id,
    label: board.title,
    destination: boardPath(board.id),
    keywords: 'recent sticky notes',
    icon: StickyNote,
    group: 'Recent board',
  })) : []
  const pages: Command[] = navigation.map(({ label, path }) => ({
    id: path, label: path === '/home' ? 'Your boards' : label,
    destination: path, keywords: 'page navigate', icon: LayoutGrid, group: 'Page',
  }))
  const results = [...studio.filter((command) => query.trim() || command.group === 'Action'), ...actions, ...recent, ...pages]
    .map((command) => ({ command, score: rank(command, query.trim().toLowerCase()) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => a.score - b.score)
    .map(({ command }) => command)
  const selected = results[active]

  useEffect(() => {
    if (open) document.getElementById(listId + '-' + active)?.scrollIntoView({ block: 'nearest' })
  }, [active, listId, open])

  function run(command: Command | StudioCommand) {
    changeOpen(false)
    if ('run' in command) requestAnimationFrame(command.run)
    else void navigate(command.destination)
  }

  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1
      event.preventDefault()
      setActive((index) => (index + step + results.length) % results.length)
    }
    if (event.key === 'Enter' && selected) {
      event.preventDefault()
      run(selected)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={<button type="button" className="sb-command-trigger" aria-label="Open command palette" aria-keyshortcuts="Control+K Meta+K" />}
      >
        <Search size={16} aria-hidden="true" />
        <span className="sb-command-trigger-label">Find a board or action</span>
        <kbd aria-hidden="true">{shortcut}</kbd>
      </DialogTrigger>

      <DialogContent className="sb-command-dialog" hideClose initialFocus={input}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search your recent boards, pages, and actions. Use arrow keys to select an item and Enter to open it.</DialogDescription>
        <div className="sb-command-search">
          <Search size={21} aria-hidden="true" />
          <input
            ref={input}
            role="combobox"
            aria-label="Search commands and boards"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={selected ? listId + '-' + active : undefined}
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
            placeholder="Find a board or action…"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0) }}
            onKeyDown={handleKeys}
          />
          <button type="button" className="sb-command-escape" onClick={() => changeOpen(false)} aria-label="Close command palette">Esc</button>
        </div>
        <ul id={listId} role="listbox" aria-label="Matching commands" className="sb-command-list">
          {results.map((command, index) => (
            <li
              id={listId + '-' + index}
              key={command.id}
              role="option"
              aria-selected={index === active}
              onPointerMove={(event) => { if (event.pointerType === 'mouse' && active !== index) setActive(index) }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run(command)}
            >
              <span className="sb-command-icon"><command.icon size={17} aria-hidden="true" /></span>
              <span className="sb-command-label">{command.label}</span>
              <span className="sb-command-group">{command.group}</span>
              <ArrowRight size={15} className="sb-command-arrow" aria-hidden="true" />
            </li>
          ))}
        </ul>
        {!results.length && <p role="status" className="sb-command-empty">No boards or actions match your search.</p>}
        <div className="sb-command-footer" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> Select <kbd>↵</kbd> Open</div>
      </DialogContent>
    </Dialog>
  )
}
