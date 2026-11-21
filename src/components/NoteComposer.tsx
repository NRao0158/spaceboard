import { Bold, Eye, Heading, List, Maximize2, Pencil } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BoardMarkdown } from './BoardMarkdown'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui'
import { MAX_NOTE_LENGTH } from '@/schemas/board-schema'

export type NoteFormat = 'heading' | 'bold' | 'bullet'

export function MarkdownTools({ onInsert, disabled }: { onInsert: (format: NoteFormat) => void; disabled?: boolean }) {
  return <>
    <button type="button" aria-label="Insert heading" title="Heading" disabled={disabled} onClick={() => onInsert('heading')}><Heading size={15} /></button>
    <button type="button" aria-label="Insert bold" title="Bold" disabled={disabled} onClick={() => onInsert('bold')}><Bold size={15} /></button>
    <button type="button" aria-label="Insert bullet list" title="Bullet list" disabled={disabled} onClick={() => onInsert('bullet')}><List size={15} /></button>
  </>
}

function insertMarkdown(value: string, from: number, to: number, format: NoteFormat) {
  if (format === 'bold') return { start: from, end: to, replacement: '**' + (value.slice(from, to) || 'bold text') + '**' }
  const start = from === 0 ? 0 : value.lastIndexOf('\n', from - 1) + 1
  const lineEnd = value.indexOf('\n', to)
  const end = lineEnd === -1 ? value.length : lineEnd
  const prefix = format === 'heading' ? '## ' : '- '
  return { start, end, replacement: value.slice(start, end).split('\n').map((line) => prefix + line).join('\n') }
}

export function NoteComposer({ initial, initialFormat, isNew, onClose, onSave }: {
  initial: string; initialFormat?: NoteFormat; isNew?: boolean
  onClose: () => void; onSave: (markdown: string) => Promise<void>
}) {
  const [markdown, setMarkdown] = useState(() => {
    if (!initialFormat) return initial
    const anchor = initialFormat === 'bold' ? initial.length : 0
    const { start, end, replacement } = insertMarkdown(initial, 0, anchor, initialFormat)
    const formatted = initial.slice(0, start) + replacement + initial.slice(end)
    return formatted.length <= MAX_NOTE_LENGTH ? formatted : initial
  })
  const [preview, setPreview] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const modalInput = useRef<HTMLTextAreaElement>(null)
  const saving = useRef(false)
  const autoFocus = useRef(true)

  useEffect(() => {
    if (preview) return
    const field = expanded ? modalInput.current : input.current
    if (!field) return
    field.focus({ preventScroll: true })
    if (autoFocus.current) field.setSelectionRange(field.value.length, field.value.length)
    autoFocus.current = false
  }, [expanded, preview])

  async function save() {
    if (saving.current || !markdown.trim()) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      await onSave(markdown)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the note.')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function insert(format: NoteFormat) {
    const field = expanded ? modalInput.current : input.current
    const { start, end, replacement } = insertMarkdown(markdown, field?.selectionStart ?? markdown.length, field?.selectionEnd ?? markdown.length, format)
    const text = markdown.slice(0, start) + replacement + markdown.slice(end)
    if (text.length > MAX_NOTE_LENGTH) return
    setMarkdown(text)
    setPreview(false)
    requestAnimationFrame(() => {
      const target = expanded ? modalInput.current : input.current
      target?.focus({ preventScroll: true })
      target?.setSelectionRange(start + replacement.length, start + replacement.length)
    })
  }

  function keys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation()
      event.preventDefault()
      if (expanded) setExpanded(false)
      else onClose()
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.stopPropagation()
      void save()
    }
  }

  const formatButtons = (
    <div className="sb-editor-tools">
      <button type="button" onClick={() => setPreview((current) => !current)} aria-label={preview ? 'Edit Markdown' : 'Preview Markdown'} title={preview ? 'Edit Markdown' : 'Preview Markdown'}>{preview ? <Pencil size={15} /> : <Eye size={15} />}</button>
      <MarkdownTools onInsert={insert} disabled={busy} />
      {!expanded && <button type="button" title="Expand editor" aria-label="Expand editor" onClick={() => { setPreview(false); setExpanded(true) }}><Maximize2 size={15} /></button>}
    </div>
  )
  const textarea = (large: boolean) => (
    <textarea ref={large ? modalInput : input} rows={large ? 10 : 4} aria-label="Note" className={large ? 'sb-field w-full' : 'sb-inline-text'} maxLength={MAX_NOTE_LENGTH}
      data-note-scroll readOnly={busy} value={markdown} placeholder="What's on your mind?" onChange={(event) => setMarkdown(event.target.value)} />
  )

  return (
    <div className="sb-inline-editor" onKeyDown={keys}>
      {!expanded && <>
        {formatButtons}
        {preview ? <div className="sb-editor-preview" data-note-scroll><BoardMarkdown source={markdown || 'Add text to preview it.'} /></div> : textarea(false)}
        {error && <p role="alert" className="sb-note-error">{error}</p>}
        <div className="sb-editor-actions">
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy || !markdown.trim()} onClick={() => void save()}>{busy ? 'Saving…' : isNew ? 'Add note' : 'Save changes'}</button>
        </div>
      </>}
      {expanded && <>
        <p className="sb-editor-placeholder">Editor expanded</p>
        <Dialog open onOpenChange={(open) => { if (!open && !busy) setExpanded(false) }}>
          <DialogContent className="sb-note-dialog max-h-[90dvh] overflow-auto bg-white text-slate-950" initialFocus={modalInput}>
            <DialogTitle>{isNew ? 'Add a sticky note' : 'Edit note'}</DialogTitle>
            <DialogDescription>Markdown editor</DialogDescription>
            {formatButtons}
            {preview ? <div className="sb-editor-preview" data-note-scroll><BoardMarkdown source={markdown} /></div> : textarea(true)}
            {error && <p role="alert" className="sb-note-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setExpanded(false)}>Back to note</Button>
              <Button className="sb-button-primary" disabled={busy || !markdown.trim()} onClick={() => void save()}>{isNew ? 'Add note' : 'Save changes'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </>}
    </div>
  )
}
