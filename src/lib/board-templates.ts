import type { NoteFields, Point } from '../schemas/board-schema'
import { boardRequest } from './board-api'
import { findFreeNoteSpot, studioSlot } from './theme-layout'

type NoteSeed = Pick<NoteFields, 'color' | 'markdown'>
type Template = { id: string; title: string; description: string; notes: readonly NoteSeed[] }

export const BOARD_TEMPLATES: readonly Template[] = [
  {
    id: 'kickoff', title: 'Product Kickoff', description: 'Align on a goal, risks, and the first milestone.',
    notes: [
      { color: 'lemon', markdown: '## The outcome\nWhat should be easier for users by the end of this project?' },
      { color: 'mint', markdown: '## Who it serves\nStart with the first-time user who has never seen the workflow.' },
      { color: 'lilac', markdown: '## First experiment\nTry the smallest version with **five users**.' },
      { color: 'peach', markdown: '## Open risks\n- Access to test data\n- Timing for the pilot' },
      { color: 'mint', markdown: '## Success signal\nWatch where users pause, then measure how many finish.' },
      { color: 'lilac', markdown: '## First week\n- [ ] Name a pilot owner\n- [ ] Set a Friday check-in' },
    ],
  },
  {
    id: 'retro', title: 'Sprint Retro', description: 'Keep what worked and fix one source of friction.',
    notes: [
      { color: 'mint', markdown: '## Keep\nPairing on the first ticket made the rest easier.' },
      { color: 'peach', markdown: '## Change\nReview requests stalled when the owner was unclear.' },
      { color: 'lemon', markdown: '## Surprise\nThe smallest prototype answered our biggest question.' },
      { color: 'lilac', markdown: '## Try next\n- [ ] Add a named reviewer before starting a ticket.' },
      { color: 'mint', markdown: '## Check progress\nCompare time to first review at the next retro.' },
    ],
  },
  {
    id: 'ideation', title: 'Feature Ideation', description: 'Explore alternatives and choose what to prototype.',
    notes: [
      { color: 'lemon', markdown: '## User need\nHelp someone resume work after a short interruption.' },
      { color: 'mint', markdown: '## Idea A\nShow a short list of recently edited items.' },
      { color: 'lilac', markdown: '## Idea B\nInclude a **continue where you left off** action.' },
      { color: 'peach', markdown: '## Open question\nWhat happens if the last item was shared or deleted?' },
      { color: 'mint', markdown: '## Validation\nPrototype two paths and compare the time to resume.' },
    ],
  },
]

export function planTemplate(template: Template, occupied: Point[]) {
  const positions = [...occupied]
  return template.notes.map((note, index) => {
    const point = findFreeNoteSpot(positions, studioSlot(index % 3, Math.floor(index / 3)))
    if (!point) throw new Error('Make some space before adding this template.')
    positions.push(point)
    return { ...note, ...point, key: crypto.randomUUID() }
  })
}

export async function seedTemplate(boardId: string, notes: ReturnType<typeof planTemplate>) {
  // Retrying with the same note keys resumes a partially successful seed.
  for (const data of notes) {
    await boardRequest('/' + boardId + '/notes', { method: 'POST', data })
  }
}
