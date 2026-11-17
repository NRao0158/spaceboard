import { Check, Trash2 } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
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
  const tabPrefix = useId()
  const textTab = useRef<HTMLButtonElement>(null)
  const previewTab = useRef<HTMLButtonElement>(null)
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

  function selectTab(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? false : event.key === 'End' ? true : !preview
    setPreview(next)
    const selected = next ? previewTab : textTab
    selected.current?.focus()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="sb-note-dialog max-h-[90dvh] overflow-auto border-slate-200 bg-white text-slate-950">
        <DialogTitle>{note ? 'Edit note' : 'Add a sticky note'}</DialogTitle>
        <DialogDescription className="text-slate-600">Use Markdown for headings, lists, links, and formatting.</DialogDescription>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <div role="tablist" aria-label="Note editor mode" onKeyDown={selectTab} className="sb-note-tabs" data-preview={preview}>
              <button ref={textTab} id={tabPrefix + '-edit'} role="tab" type="button" aria-controls={tabPrefix + '-editor'} aria-selected={!preview} tabIndex={preview ? -1 : 0} onClick={() => setPreview(false)}>Edit text</button>
              <button ref={previewTab} id={tabPrefix + '-view'} role="tab" type="button" aria-controls={tabPrefix + '-preview'} aria-selected={preview} tabIndex={preview ? 0 : -1} onClick={() => setPreview(true)}>Preview Markdown</button>
            </div>
            <div id={tabPrefix + '-editor'} role="tabpanel" aria-labelledby={tabPrefix + '-edit'} hidden={preview}>
              <label htmlFor="sticky-text" className="sr-only">Note</label>
              <textarea id="sticky-text" rows={5} required={!preview} maxLength={MAX_NOTE_LENGTH} value={markdown} onChange={(e) => setMarkdown(e.target.value)}
                className="sb-field w-full resize-y"
                placeholder="What’s on your mind?" />
            </div>
            <div id={tabPrefix + '-preview'} role="tabpanel" aria-labelledby={tabPrefix + '-view'} hidden={!preview}
              tabIndex={preview ? 0 : -1} className="min-h-36 rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm">
              {preview && (markdown.trim() ? <BoardMarkdown source={markdown} /> : 'Add some text to preview it.')}
            </div>
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
              <Button variant="outline" className="sb-button-secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep note</Button>
              <Button variant="destructive" loading={busy} onClick={() => void run(onDelete)}>Delete</Button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {note && <Button variant="ghost" className="mr-auto text-rose-700" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" /> Delete note</Button>}
              <Button variant="outline" className="sb-button-secondary" disabled={busy} onClick={onClose}>Cancel</Button>
              <Button className="sb-button-primary" type="submit" loading={busy} disabled={!markdown.trim()}>
                {note ? 'Save changes' : 'Add note'}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
