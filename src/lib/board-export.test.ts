import { expect, it } from 'vitest'
import { buildActionBrief } from './board-export'
import type { Note } from '../schemas/board-schema'

const note = (id: string, markdown: string, x: number, reactions?: string): Note => ({
  recordId: id, data: { markdown, x, y: 0, color: 'lemon', reactions }, createdAt: '', updatedAt: '', createdBy: 'a',
})

it('formats spatially ordered notes, vote rankings and labeled threads without requiring AI', () => {
  const notes = [
    note('a', '## Review\n\n- [x] Meet', 420),
    note('b', '# Pilot *team*', 20, JSON.stringify([{ userId: 'a', kind: 'like' }])),
  ]
  const markdown = buildActionBrief({ title: 'Studio #1', notes, sections: [], edges: [
    { id: 'valid', fromNoteId: 'b', toNoteId: 'a', createdBy: 'a', label: 'leads to' },
    { id: 'stale', fromNoteId: 'a', toNoteId: 'missing', createdBy: 'a' },
  ] })
  expect(markdown).toContain('# Studio \\#1 — Action brief')
  expect(markdown).toContain('## Top voted\n\n- Note 1 · Pilot \\*team\\* — 1 vote')
  expect(markdown).toContain('Note 1 · Pilot \\*team\\* → Note 2 · Review · leads to')
  expect(markdown).toContain('> - [x] Meet')
  expect(markdown).not.toContain('## Synthesis')
  expect(markdown).not.toContain('missing')
})
