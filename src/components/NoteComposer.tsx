import { Check, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { BoardMarkdown } from './BoardMarkdown'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui'
import { MAX_NOTE_LENGTH, NOTE_COLORS, type Note, type NoteFields } from '@/schemas/board-schema'

const swatches: Record<NoteFields['color'], string> = {
  lemon: 'bg-[#fff1ac]', mint: 'bg-[#caf0df]', lilac: 'bg-[#e8ddff]', peach: 'bg-[#ffddcc]',
}

interface NoteComposerProps {
  note?: Note
  onClose: () => void
  onSave: (data: Pick<NoteFields, 'markdown' | 'color'>) => Promise<void>
  onDelete: () => Promise<void>
}

export function NoteComposer({ note, onClose, onSave, onDelete }: NoteComposerProps) {
  const [markdown, setMarkdown] = useState(note?.data.markdown ?? '')
  const [color, setColor] = useState<NoteFields['color']>(note?.data.color ?? 'lemon')
  const [preview, setPreview] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this change.')
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (markdown.trim()) void run(() => onSave({ markdown, color }))
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-auto border-slate-200 bg-white text-slate-950">
        <DialogTitle>{note ? 'Edit note' : 'Add a sticky note'}</DialogTitle>
        <DialogDescription className="text-slate-600">Use Markdown for headings, lists, links, and formatting.</DialogDescription>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label htmlFor="sticky-text" className="text-sm font-medium">Note</label>
              <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)} className="text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline">
                {preview ? 'Edit text' : 'Preview Markdown'}
              </button>
            </div>
            {preview ? (
              <div id="sticky-text" aria-label="Markdown preview" className="min-h-36 rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm">
                {markdown.trim() ? <BoardMarkdown source={markdown} /> : 'Add some text to preview it.'}
              </div>
            ) : (
              <textarea id="sticky-text" rows={5} required maxLength={MAX_NOTE_LENGTH} value={markdown} onChange={(e) => setMarkdown(e.target.value)}
                className="w-full resize-y rounded-xl border border-slate-300 p-3 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
                placeholder="What’s on your mind?" />
            )}
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Color</legend>
            <div className="flex flex-wrap gap-2">
              {NOTE_COLORS.map((choice) => (
                <label key={choice} className={'grid size-9 cursor-pointer place-items-center rounded-full border border-slate-300 text-slate-900 focus-within:ring-2 focus-within:ring-indigo-600 ' + swatches[choice]}>
                  <input type="radio" name="note-color" value={choice} checked={color === choice} onChange={() => setColor(choice)} className="sr-only" />
                  <span className="sr-only">{choice}</span>
                  {choice === color && <Check className="size-4" aria-hidden="true" />}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          {confirmDelete ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-sm font-medium text-rose-700">Delete this note for everyone?</span>
              <Button variant="outline" className="bg-white text-slate-800" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep note</Button>
              <Button variant="destructive" loading={busy} onClick={() => void run(onDelete)}>Delete</Button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {note && <Button variant="ghost" className="mr-auto text-rose-700" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" /> Delete note</Button>}
              <Button variant="outline" className="bg-white text-slate-800" disabled={busy} onClick={onClose}>Cancel</Button>
              <Button className="bg-indigo-700 text-white hover:bg-indigo-800" type="submit" loading={busy} disabled={!markdown.trim()}>
                {note ? 'Save changes' : 'Add note'}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
