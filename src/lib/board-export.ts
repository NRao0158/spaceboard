import { readReactions } from './board-reactions'
import type { BoardEdge } from './board-edges'
import { insideSection, type BoardSection } from './board-sections'
import type { BoardSummary } from './theme-layout'
import type { Note } from '../schemas/board-schema'

function inline(value: string) {
  return value.replace(/\s+/g, ' ').trim().replace(/[\\<>*_#\[\]\x60]/g, '\\$&')
}

function quote(value: string) {
  return value.split(/\r?\n/).map((line) => '> ' + line).join('\n')
}

export function buildActionBrief({ title, notes, edges, sections, summary }: {
  title: string; notes: Note[]; edges: BoardEdge[]; sections: BoardSection[]; summary?: BoardSummary
}) {
  const ordered = [...notes].sort((a, b) => a.data.y - b.data.y || a.data.x - b.data.x)
  const labels = new Map(ordered.map(({ recordId, data }, index) => {
    const first = data.markdown.split(/\r?\n/).find((line) => line.trim())?.replace(/^#{1,6}\s+/, '') || 'Sticky note'
    return [recordId, 'Note ' + (index + 1) + ' · ' + inline(first.slice(0, 90))]
  }))
  const chapters = ['# ' + inline(title) + ' — Action brief']
  if (summary) {
    chapters.push('## Synthesis\n\n' + quote(summary.summary))
    if (summary.themes.length) chapters.push('## Themes\n\n' + summary.themes.map((theme) => {
      const links = theme.noteIds.map((id) => labels.get(id)).filter(Boolean)
      return '- **' + inline(theme.name) + '** · ' + inline(theme.detail) + (links.length ? ' (' + links.join('; ') + ')' : '')
    }).join('\n'))
    if (summary.nextSteps.length) chapters.push('## Suggested next steps\n\n' + summary.nextSteps.map((step) => '- [ ] ' + inline(step)).join('\n'))
  }
  const voted = ordered.map((note) => ({ id: note.recordId, count: readReactions(note.data.reactions).length }))
    .filter(({ count }) => count).sort((a, b) => b.count - a.count).slice(0, 10)
  if (voted.length) chapters.push('## Top voted\n\n' + voted.map(({ id, count }) => '- ' + labels.get(id) + ' — ' + count + (count === 1 ? ' vote' : ' votes')).join('\n'))
  const threads = edges.filter(({ fromNoteId, toNoteId }) => labels.has(fromNoteId) && labels.has(toNoteId))
  if (threads.length) chapters.push('## Idea threads\n\n' + threads.map((edge) => '- ' + labels.get(edge.fromNoteId) + ' → ' +
    labels.get(edge.toNoteId) + (edge.label ? ' · ' + inline(edge.label) : '')).join('\n'))
  chapters.push('## Board notes\n\n' + (ordered.map(({ recordId, data }) => {
    const groups = sections.filter((section) => insideSection(section, data)).map(({ title: sectionTitle }) => inline(sectionTitle))
    return '### ' + labels.get(recordId) + '\n\n' + (groups.length ? '_Sections: ' + groups.join(', ') + '_\n\n' : '') + quote(data.markdown)
  }).join('\n\n') || 'No notes yet.'))
  return chapters.join('\n\n') + '\n'
}

export function downloadActionBrief(title: string, markdown: string) {
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'spaceboard'
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename + '-action-brief.md'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
