import { z } from 'zod'

export const TIMER_SECONDS = [180, 300, 600] as const
export const timerDuration = z.union([z.literal(180), z.literal(300), z.literal(600)])
export const timerSchema = z.strictObject({
  status: z.enum(['idle', 'running', 'paused']),
  endsAt: z.number().int().nonnegative().nullable(),
  remainingMs: z.number().int().min(0).max(600_000),
  startedBy: z.string().max(192).nullable(),
  duration: timerDuration,
}).refine((timer) => timer.status === 'running' ? timer.endsAt !== null : timer.endsAt === null)
export type SessionTimer = z.infer<typeof timerSchema>
export const idleTimer: SessionTimer = { status: 'idle', endsAt: null, remainingMs: 300_000, startedBy: null, duration: 300 }
export const timerActionSchema = z.strictObject({ action: z.enum(['start', 'pause', 'reset', 'preset']), duration: timerDuration.optional() })
export type TimerAction = z.infer<typeof timerActionSchema>

export function remainingTime(timer: SessionTimer, now: number) {
  return timer.endsAt === null ? timer.remainingMs : Math.max(0, Math.min(timer.duration * 1000, timer.endsAt - now))
}

export function changeTimer(timer: SessionTimer, input: TimerAction, userId: string, now: number): SessionTimer {
  const duration = input.duration ?? timer.duration
  const remainingMs = remainingTime(timer, now)
  const clean = { ...idleTimer, duration, remainingMs: duration * 1000 }
  if (input.action === 'reset' || input.action === 'preset') return clean
  if (input.action === 'pause') {
    return timer.status === 'running' ? { ...timer, status: 'paused', endsAt: null, remainingMs } : timer
  }
  if (timer.status === 'running' && remainingMs > 0 && input.duration === undefined) return timer
  const next = timer.status === 'paused' && remainingMs > 0 && !input.duration ? remainingMs : duration * 1000
  return { status: 'running', endsAt: now + next, remainingMs: next, duration, startedBy: userId }
}
