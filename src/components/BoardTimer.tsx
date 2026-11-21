import { Pause, Play, RotateCcw, Timer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { remainingTime, TIMER_SECONDS, type SessionTimer, type TimerAction } from '@/lib/board-timer'

export function BoardTimer({ timer, clockOffset, onChange, onFinish, disabled }: {
  timer: SessionTimer; clockOffset: number; onChange: (action: TimerAction) => void; onFinish: () => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [pulse, setPulse] = useState(false)
  const complete = useRef<number | null>(null)
  const latest = useRef(onFinish)
  latest.current = onFinish
  const seconds = Math.ceil(remainingTime(timer, now + clockOffset) / 1000)
  const running = timer.status === 'running' && seconds > 0
  const time = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')

  useEffect(() => {
    setNow(Date.now())
    if (timer.status !== 'running') return
    const id = window.setInterval(() => setNow(Date.now()), 150)
    return () => clearInterval(id)
  }, [timer.endsAt, timer.status])

  useEffect(() => {
    const end = timer.endsAt
    if (end === null || seconds > 0 || complete.current === end) return
    complete.current = end
    if (Math.abs(now + clockOffset - end) > 2400) return
    latest.current()
    setPulse(true)
    const timeout = window.setTimeout(() => setPulse(false), 850)
    return () => { clearTimeout(timeout); setPulse(false) }
  }, [seconds, timer.endsAt, clockOffset])

  return <div className="sb-timer">
    <button type="button" className="sb-peer-trigger" data-timer-pulse={pulse} aria-label={'Brainstorm timer ' + time}
      aria-expanded={open} onClick={() => setOpen((old) => !old)}><Timer size={15} /><span data-timer-count>{time}</span></button>
    {open && <div className="sb-timer-panel sb-hud" role="group" aria-label="Brainstorm timer controls">
      <div className="sb-timer-presets">
        {TIMER_SECONDS.map((duration) => <button key={duration} type="button" aria-pressed={timer.duration === duration}
          disabled={disabled || running} onClick={() => onChange({ action: 'preset', duration })}>{duration / 60}m</button>)}
      </div>
      <div className="sb-timer-actions">
        <button type="button" disabled={disabled} onClick={() => onChange({ action: running ? 'pause' : 'start' })}>
          {running ? <Pause size={15} /> : <Play size={15} />}{running ? 'Pause' : 'Start'}
        </button>
        <button type="button" disabled={disabled} onClick={() => onChange({ action: 'reset' })}><RotateCcw size={15} /> Reset</button>
      </div>
    </div>}
  </div>
}
