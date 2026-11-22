import { Cable, CircleHelp, Expand, Frame, Redo2, SmilePlus, Undo2, Volume2, VolumeX, Hand, LayoutTemplate, Moon, MousePointer2, Plus, Search, Star, Sun, X } from 'lucide-react'
import { NOTE_COLORS, type NoteFields } from '@/schemas/board-schema'

export type NoteColor = NoteFields['color']
const names: Record<NoteColor, string> = { lemon: 'Yellow', mint: 'Mint', lilac: 'Lavender', peach: 'Peach' }

export function ColorSwatches({ value, onChange, disabled }: { value?: NoteColor; onChange: (color: NoteColor) => void; disabled?: boolean }) {
  return (
    <div className="sb-swatches" role="group" aria-label="Note color">
      {NOTE_COLORS.map((color) => (
        <button key={color} type="button" className={'sb-swatch sb-paper-' + color} aria-label={names[color]}
          title={names[color]} aria-pressed={color === value} disabled={disabled} onClick={() => onChange(color)} />
      ))}
    </div>
  )
}

type DockProps = {
  color: NoteColor; pan: boolean; dark: boolean; search: boolean; top: boolean; canAdd: boolean; templates: boolean; help: boolean
  onColor: (color: NoteColor) => void; onAdd: () => void; onMode: (pan: boolean) => void; onTheme: () => void; onSearch: () => void
  connect: boolean; zen: boolean; sound: boolean; canUndo: boolean; canRedo: boolean
  onConnect: () => void; onFrame: () => void; onZen: () => void; onSound: () => void; onEmote: () => void; onUndo: () => void; onRedo: () => void
  onTop: () => void; onTemplates: () => void; onHelp: () => void
}

export function StudioDock(props: DockProps) {
  return (
    <div className="sb-studio-dock sb-hud" role="group" aria-label="Studio tools">
      <button type="button" className="sb-dock-add" onClick={props.onAdd} disabled={!props.canAdd} title="New note (N)" aria-label="New note"><Plus size={17} /><span>New note</span></button>
      <ColorSwatches value={props.color} onChange={props.onColor} />
      <div className="sb-dock-divider" />
      <button type="button" aria-label="Select mode" title="Select (V)" aria-pressed={!props.pan} onClick={() => props.onMode(false)}><MousePointer2 size={16} /></button>
      <button type="button" aria-label="Pan mode" title="Pan (H)" aria-pressed={props.pan} onClick={() => props.onMode(true)}><Hand size={16} /></button>
      <div className="sb-dock-divider" />
      <button type="button" aria-label={props.dark ? 'Use lavender theme' : 'Use obsidian theme'} title="Canvas theme" onClick={props.onTheme}>{props.dark ? <Sun size={17} /> : <Moon size={17} />}</button>
      <button type="button" aria-label="Search notes" title="Search (/)" aria-pressed={props.search} onClick={props.onSearch}><Search size={17} /></button>
      <button type="button" aria-label="Top voted notes" title="Top voted" aria-pressed={props.top} onClick={props.onTop}><Star size={17} /></button>
      <button type="button" aria-label="Board templates" title="Templates" aria-expanded={props.templates} onClick={props.onTemplates}><LayoutTemplate size={17} /></button>
      <button type="button" aria-label="Connect mode" title="Connect (C)" aria-pressed={props.connect} onClick={props.onConnect}><Cable size={17} /></button>
      <button type="button" aria-label="New section" title="New section (F)" onClick={props.onFrame}><Frame size={17} /></button>
      <button type="button" aria-label="Live emotes" title="Emotes (E)" onClick={props.onEmote}><SmilePlus size={17} /></button>
      <button type="button" aria-label="Zen mode" title="Zen mode (Z)" aria-pressed={props.zen} onClick={props.onZen}><Expand size={17} /></button>
      <button type="button" aria-label="Sound effects" title="Sound effects" aria-pressed={props.sound} onClick={props.onSound}>{props.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
      <button type="button" aria-label="Undo" title="Undo (Ctrl / Cmd + Z)" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={17} /></button>
      <button type="button" aria-label="Redo" title="Redo (Ctrl / Cmd + Shift + Z)" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={17} /></button>
      <button type="button" aria-label="Keyboard shortcuts" title="Shortcuts (?)" aria-expanded={props.help} onClick={props.onHelp}><CircleHelp size={17} /></button>
    </div>
  )
}

const shortcuts = [
  ['N', 'New note'], ['V / H', 'Select / Pan'], ['Space + drag', 'Pan'], ['Ctrl / Cmd + scroll', 'Zoom toward pointer'],
  ['Double-click', 'Create or edit note'], ['Enter', 'Edit selected note'], ['Ctrl / Cmd + Enter', 'Save note'],
  ['Arrow keys on handle', 'Move note'], ['/', 'Cursor chat'], ['C / F', 'Connect / New section'], ['E / Z', 'Emotes / Zen'], ['Ctrl / Cmd + Z', 'Undo (add Shift to redo)'], ['Esc', 'Cancel or clear'], ['?', 'Keyboard shortcuts'],
]

export function StudioShortcuts({ onClose }: { onClose: () => void }) {
  return (
    <section aria-label="Keyboard shortcuts" className="sb-studio-popover sb-hud">
      <header><h2>Keyboard shortcuts</h2><button type="button" onClick={onClose} aria-label="Close shortcuts"><X size={16} /></button></header>
      <dl>{shortcuts.map(([key, label]) => <div key={key}><dt>{label}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl>
    </section>
  )
}
