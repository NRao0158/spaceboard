import { useEffect, useRef, useState } from 'react'
import { useEmoteBursts } from '@/components/PresenceExtras'
import { boardRequest } from './board-api'
import type { TimerAction } from './board-timer'
import { playSound, readSoundPreference, saveSoundPreference, unlockSound } from './sound-fx'
import { readCanvasPoint, type Emote, type StudioPeer } from './use-board-presence'
import type { Point } from '../schemas/board-schema'

export function useStudioSession(props: {
  boardId: string; clockOffset: number; peers: StudioPeer[]; center: () => Point; cursor: Point | null
  publish: (data: Record<string, unknown>, immediate?: boolean) => void
  follow: (point: Point | null) => void; report: (failure: unknown) => void
}) {
  const [zen, setZen] = useState(false)
  const [sound, setSound] = useState(readSoundPreference)
  const [clockOffset, setClockOffset] = useState(props.clockOffset)
  const [chat, setChat] = useState<Point>()
  const [emotesOpen, setEmotesOpen] = useState(false)
  const [following, setFollowing] = useState<string>()
  const bursts = useEmoteBursts(props.peers)
  const timerBusy = useRef(false)
  const currentFollow = useRef(props.follow)
  currentFollow.current = props.follow
  const peer = props.peers.find(({ userId }) => userId === following)

  useEffect(() => {
    if (following && !peer) setFollowing(undefined)
    currentFollow.current(peer?.cursor ?? null)
  }, [following, peer?.userId, peer?.cursor?.x, peer?.cursor?.y])

  function stopFollowing() {
    setFollowing(undefined)
    props.follow(null)
  }

  function toggleSound() {
    if (!sound) unlockSound()
    setSound(!sound)
    saveSoundPreference(!sound)
  }

  async function timerAction(action: TimerAction) {
    if (timerBusy.current) return
    timerBusy.current = true
    const started = Date.now()
    try {
      const result = await boardRequest<{ serverNow: number }>('/' + props.boardId + '/timer', { method: 'PUT', data: action })
      setClockOffset(result.serverNow - (started + Date.now()) / 2)
    } catch (failure) {
      props.report(failure)
    } finally {
      timerBusy.current = false
    }
  }

  function sendEmote(emoji: Emote['emoji']) {
    const point = readCanvasPoint(props.cursor ?? props.center())
    if (!point) return
    const event = { id: crypto.randomUUID(), emoji, point, updatedAt: Date.now() }
    bursts.add(event)
    props.publish({ emote: event }, true)
    setEmotesOpen(false)
  }

  function chatText(text: string | null) {
    props.publish({ cursorChat: text === null ? null : { text, updatedAt: Date.now() } }, text === null)
  }

  return {
    zen, setZen, sound, toggleSound, play: (kind: Parameters<typeof playSound>[0]) => playSound(kind, sound),
    clockOffset, timerAction, peer, setFollowing, stopFollowing, chat, closeChat: () => setChat(undefined), chatText,
    openChat: () => {
      const point = readCanvasPoint(props.cursor ?? props.center())
      if (!point) return
      props.publish({ cursor: point }, true)
      setChat(point)
    },
    emotesOpen, setEmotesOpen, sendEmote, bursts: bursts.items,
  }
}
