import { GripHorizontal, MoveDiagonal2, X } from 'lucide-react'
import { useState, type PointerEvent } from 'react'
import { SECTION_COLORS, type BoardSection } from '@/lib/board-sections'

export function BoardSectionFrame({ frame, disabled, remote, onGesture, onChange, onDelete }: {
  frame: BoardSection; disabled?: boolean; remote?: boolean
  onGesture: (event: PointerEvent<HTMLElement>, resize: boolean) => void
  onChange: (next: BoardSection) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState<string>()
  return <section data-section-id={frame.id} className="sb-section-frame" data-section-color={frame.color} data-remote-frame={remote}
    aria-label={frame.title} style={{ width: frame.width, height: frame.height, transform: 'translate(' + frame.x + 'px,' + frame.y + 'px)' }}>
    <header onPointerDown={(event) => {
      if (!disabled && event.target instanceof Element && !event.target.closest('button, input, select')) onGesture(event, false)
    }}>
      <button type="button" aria-label={'Move section ' + frame.title} className="sb-section-grip" disabled={disabled}
        onPointerDown={(event) => onGesture(event, false)}><GripHorizontal size={17} /></button>
      <input aria-label="Section name" value={title ?? frame.title} maxLength={90} disabled={disabled}
        onChange={(event) => setTitle(event.target.value)} onBlur={() => {
          const next = title?.trim()
          if (next && next !== frame.title) onChange({ ...frame, title: next })
          setTitle(undefined)
        }} onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') { event.stopPropagation(); setTitle(undefined) }
        }} />
      <select aria-label="Section color" value={frame.color} disabled={disabled}
        onChange={(event) => onChange({ ...frame, color: event.target.value as BoardSection['color'] })}>
        {SECTION_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
      </select>
      <button type="button" disabled={disabled} aria-label={'Delete section ' + frame.title} onClick={onDelete}><X size={14} /></button>
    </header>
    <button type="button" className="sb-section-resize" disabled={disabled} aria-label={'Resize section ' + frame.title}
      onPointerDown={(event) => onGesture(event, true)}><MoveDiagonal2 size={16} /></button>
  </section>
}
