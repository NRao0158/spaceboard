import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { EMOTES, type Emote, type StudioPeer } from '@/lib/use-board-presence'
import type { Point } from '@/schemas/board-schema'

const CHAT_TIMEOUT = 5000
const EMOTE_LIFETIME = 1650

export function CursorChat({ anchor, onText, onClose }: { anchor: Point; onText: (text: string | null) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const timeout = useRef<number | undefined>(undefined)
  const latest = useRef({ onText, onClose })
  latest.current = { onText, onClose }

  function close() {
    latest.current.onText(null)
    latest.current.onClose()
  }

  function reset() {
    clearTimeout(timeout.current)
    timeout.current = window.setTimeout(close, CHAT_TIMEOUT)
  }

  useEffect(() => {
    reset()
    return () => { clearTimeout(timeout.current); latest.current.onText(null) }
  }, [])

  return <form className="sb-cursor-chat-input sb-hud" style={{ left: anchor.x, top: anchor.y }} onSubmit={(event) => { event.preventDefault(); close() }}>
    <input aria-label="Cursor chat" autoFocus maxLength={80} placeholder="Say something…" value={text}
      onChange={(event) => { setText(event.target.value); onText(event.target.value); reset() }}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }} />
  </form>
}

export function RemoteChat({ chat }: { chat: StudioPeer['chat'] }) {
  const [, tick] = useState(0)
  const end = chat ? chat.updatedAt + CHAT_TIMEOUT : 0
  useEffect(() => {
    if (!end) return
    const time = window.setTimeout(() => tick((n) => n + 1), Math.max(0, end - Date.now()))
    return () => clearTimeout(time)
  }, [end])
  const visible = !!chat?.text && end > Date.now() && chat.updatedAt - Date.now() < 10000
  const previous = useRef('')
  if (visible) previous.current = chat.text
  return previous.current ? <span data-visible={visible} className="sb-cursor-bubble">{previous.current}</span> : null
}

export function EmoteWheel({ onSend }: { onSend: (emoji: typeof EMOTES[number]) => void }) {
  return <div className="sb-emote-wheel sb-hud" role="group" aria-label="Live emotes">
    {EMOTES.map((emoji, index) => <button key={emoji} type="button" aria-label={'Send ' + emoji} onClick={() => onSend(emoji)}>
      <span>{emoji}</span><kbd>{index + 1}</kbd>
    </button>)}
  </div>
}

export function useEmoteBursts(peers: StudioPeer[]) {
  const [items, setItems] = useState<Emote[]>([])
  const seen = useRef(new Set<string>())
  const timers = useRef(new Map<string, number>())

  function add(event: Emote) {
    const age = Date.now() - event.updatedAt
    if (seen.current.has(event.id) || age >= EMOTE_LIFETIME || age < -10000) return
    seen.current.add(event.id)
    if (seen.current.size > 160) {
      const oldest = seen.current.values().next().value
      if (oldest) seen.current.delete(oldest)
    }
    setItems((old) => [...old.slice(-23), event])
    timers.current.set(event.id, window.setTimeout(() => {
      timers.current.delete(event.id)
      setItems((old) => old.filter(({ id }) => id !== event.id))
    }, EMOTE_LIFETIME))
  }

  useEffect(() => {
    for (const peer of peers) if (peer.emote) add(peer.emote)
  }, [peers])
  useEffect(() => {
    const active = timers.current
    return () => active.forEach((timer) => clearTimeout(timer))
  }, [])
  return { items, add }
}

export function EmoteBursts({ items, zoom = 1 }: { items: Emote[]; zoom?: number }) {
  return <div className="sb-emote-layer" aria-hidden="true">
    {items.map(({ id, point, emoji }) => <div key={id} data-emote={emoji} className="sb-emote-origin"
      style={{ left: point.x, top: point.y, transform: 'scale(' + 1 / zoom + ')' }}>
      {[[-38, -64, -19], [-12, -104, 15], [20, -88, 24], [42, -58, -12]].map(([x, y, angle], index) => (
        <i key={index} style={{ '--emote-x': x + 'px', '--emote-y': y + 'px', '--emote-r': angle + 'deg', animationDelay: index * .035 + 's' } as CSSProperties}>{emoji}</i>
      ))}
    </div>)}
  </div>
}
