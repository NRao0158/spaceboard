import { expect, it } from 'vitest'
import { readReactions, setReaction } from './board-reactions'

it('loads old notes and safely defaults malformed values', () => {
  expect(readReactions(undefined)).toEqual([])
  expect(readReactions('{')).toEqual([])
  expect(readReactions(JSON.stringify([{ userId: 'one', kind: 'unknown' }]))).toEqual([])
})

it('retries each desired state without duplicates or interference between users', () => {
  const liked = setReaction([], 'one', 'like', true)!
  expect(setReaction(liked, 'one', 'like', true)).toBe(liked)
  const second = setReaction(liked, 'two', 'like', true)!
  const fire = setReaction(second, 'one', 'fire', true)!
  const unliked = setReaction(fire, 'one', 'like', false)!
  expect(unliked).toEqual([{ userId: 'two', kind: 'like' }, { userId: 'one', kind: 'fire' }])
  expect(setReaction(unliked, 'one', 'like', false)).toBe(unliked)
})
