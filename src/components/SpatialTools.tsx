import { AlignLeft, AlignStartVertical, Check, Grid2X2, PanelsTopLeft, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { Rect } from '@/lib/board-sections'
import type { BoardEdge } from '@/lib/board-edges'
import type { Point } from '@/schemas/board-schema'
import { ColorSwatches, type NoteColor } from './StudioControls'

export function SelectionToolbar({ count, bounds, onColor, onAlign, onWrap, onDelete }: {
  count: number; bounds: Rect; onColor: (color: NoteColor) => void
  onAlign: (mode: 'left' | 'top' | 'tidy') => void; onWrap: () => void; onDelete: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  return <div className="sb-selection-tools sb-hud" style={{ left: bounds.x, top: bounds.y }}
    data-below={bounds.y < 45} role="group" aria-label="Selected notes actions">
    <strong>{count} selected</strong>
    <ColorSwatches onChange={onColor} />
    <button type="button" title="Align left" aria-label="Align left" onClick={() => onAlign('left')}><AlignLeft size={16} /></button>
    <button type="button" title="Align top" aria-label="Align top" onClick={() => onAlign('top')}><AlignStartVertical size={16} /></button>
    <button type="button" title="Tidy grid" aria-label="Tidy grid" onClick={() => onAlign('tidy')}><Grid2X2 size={16} /></button>
    <button type="button" title="Wrap in section" aria-label="Wrap in section" onClick={onWrap}><PanelsTopLeft size={16} /></button>
    <button type="button" title={confirm ? 'Confirm deletion' : 'Delete selected'} aria-label={confirm ? 'Confirm delete selected' : 'Delete selected'}
      onBlur={() => setConfirm(false)} onClick={() => confirm ? onDelete() : setConfirm(true)}>{confirm ? <Check size={16} /> : <Trash2 size={16} />}</button>
  </div>
}

export function EdgeEditor({ edge, point, onEdit, onDelete, onClose }: {
  edge: BoardEdge; point: Point; onEdit: (changes: Pick<BoardEdge, 'label' | 'style'>) => Promise<void>; onDelete: () => void; onClose: () => void
}) {
  const [label, setLabel] = useState(edge.label ?? '')
  const [style, setStyle] = useState(edge.style ?? 'solid')
  const [saving, setSaving] = useState(false)
  return <form className="sb-edge-editor sb-hud" style={{ left: point.x, top: point.y }} aria-label="Edit idea thread" onSubmit={(event) => {
    event.preventDefault()
    setSaving(true)
    void onEdit({ label: label.trim() || undefined, style }).then(onClose).catch(() => {}).finally(() => setSaving(false))
  }}>
    <input aria-label="Thread label" placeholder="Thread label" maxLength={48} value={label} onChange={(event) => setLabel(event.target.value)} />
    <select aria-label="Thread style" value={style} onChange={(event) => setStyle(event.target.value === 'dashed' ? 'dashed' : 'solid')}>
      <option value="solid">Solid</option><option value="dashed">Dashed</option>
    </select>
    <button disabled={saving} type="submit" aria-label="Save thread"><Check size={16} /></button>
    <button disabled={saving} type="button" aria-label="Delete thread" onClick={onDelete}><Trash2 size={16} /></button>
    <button type="button" aria-label="Close thread editor" onClick={onClose}><X size={16} /></button>
  </form>
}
