import { useEffect, useRef, useState } from 'react'
import type { FacilitatorMode } from '@/components/BoardFacilitator'
import { boardRequest } from './board-api'
import type { BoardSummary } from './theme-layout'
import type { GapInsights } from './board-insights'
import type { Point } from '../schemas/board-schema'

type Analysis = 'summary' | 'gaps'

export function useBoardFacilitator(boardId: string, noteCount: number, onFinish: () => void) {
  const [mode, setMode] = useState<FacilitatorMode>()
  const [summary, setSummary] = useState<BoardSummary>()
  const [gaps, setGaps] = useState<GapInsights>()
  const [busy, setBusy] = useState<Analysis>()
  const [error, setError] = useState<Partial<Record<Analysis, string>>>({})
  const [spotlight, setSpotlight] = useState<{ mode: Analysis; index: number }>()
  const request = useRef<AbortController | null>(null)
  const retry = useRef(new Map<string, { point: Point; key: string }>())

  useEffect(() => () => request.current?.abort(), [])

  async function generate(next: Analysis) {
    if (request.current || !noteCount) return
    const controller = new AbortController()
    request.current = controller
    setBusy(next)
    setError((old) => ({ ...old, [next]: undefined }))
    try {
      const result = await boardRequest<BoardSummary | GapInsights>('/' + boardId + '/' + next, { method: 'POST', signal: controller.signal })
      if (controller.signal.aborted) return
      if ('gaps' in result) setGaps(result)
      else setSummary(result)
      retry.current.clear()
      setSpotlight(undefined)
      onFinish()
    } catch (failure) {
      if (!controller.signal.aborted) setError((old) => ({ ...old, [next]: failure instanceof Error ? failure.message : 'Could not analyze the board.' }))
    } finally {
      if (request.current === controller) {
        request.current = null
        setBusy(undefined)
      }
    }
  }

  function open(next?: FacilitatorMode, run = false) {
    setMode(next)
    setSpotlight(undefined)
    if (run && (next === 'summary' && !summary && !error.summary || next === 'gaps' && !gaps && !error.gaps)) void generate(next)
  }

  const theme = spotlight?.mode === 'summary' ? summary?.themes[spotlight.index] : undefined
  const gap = spotlight?.mode === 'gaps' ? gaps?.gaps[spotlight.index] : undefined
  return {
    mode, open, summary, gaps, busy, error, generate, spotlight, setSpotlight, retry,
    link: theme ? { name: theme.name, noteIds: theme.noteIds, kind: 'theme' } : gap ? { name: gap.title, noteIds: gap.noteIds, kind: 'gap' } : undefined,
  }
}
