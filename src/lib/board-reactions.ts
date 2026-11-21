import { z } from 'zod'

export const REACTIONS = { like: '👍', fire: '🔥', idea: '💡' } as const
export const reactionKind = z.enum(['like', 'fire', 'idea'])
export type ReactionKind = z.infer<typeof reactionKind>
const entry = z.object({ userId: z.string().min(1).max(192), kind: reactionKind })
export type Reaction = z.infer<typeof entry>
export const MAX_REACTIONS = 300

export function readReactions(value: string | undefined): Reaction[] {
  if (!value) return []
  try {
    const parsed = z.array(entry).max(MAX_REACTIONS).safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

// Explicit desired state makes repeated requests idempotent.
export function setReaction(votes: Reaction[], userId: string, kind: ReactionKind, active: boolean) {
  const current = votes.filter((vote) => vote.userId === userId && vote.kind === kind)
  if ((active && current.length === 1) || (!active && !current.length)) return votes
  const remaining = votes.filter((vote) => vote.userId !== userId || vote.kind !== kind)
  if (!active) return remaining
  if (remaining.length >= MAX_REACTIONS) return null
  return [...remaining, { userId, kind }]
}
