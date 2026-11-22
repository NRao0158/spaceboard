import { CircleHelp, FileText, Plus, Sparkles, X } from 'lucide-react'
import { AiInsightsDrawer } from './AiInsightsDrawer'
import { ActionBrief } from './ActionBrief'
import type { ComponentProps } from 'react'
import type { GapInsights } from '@/lib/board-insights'

export type FacilitatorMode = 'summary' | 'gaps' | 'export'

export function BoardFacilitator({ mode, onMode, title, markdown, synthesis, gaps, onGap, activeGap, onGapNote, ...other }: {
  mode: FacilitatorMode; onMode: (mode: FacilitatorMode) => void; title: string; markdown: string
  synthesis: ComponentProps<typeof AiInsightsDrawer>; gaps?: GapInsights; activeGap: number | null
  onGap: (index: number | null) => void; onGapNote: (prompt: string, index: number) => void
}) {
  const { onClose, onGenerate, busy, error, working, canAdd, canGenerate } = synthesis
  const tabs = <div className="sb-facilitator-tabs" role="group" aria-label="Facilitator mode">
    <button type="button" aria-pressed={mode === 'summary'} onClick={() => onMode('summary')}><Sparkles size={15} /> Synthesize</button>
    <button type="button" aria-pressed={mode === 'gaps'} onClick={() => onMode('gaps')}><CircleHelp size={15} /> Find gaps</button>
    <button type="button" aria-pressed={mode === 'export'} onClick={() => onMode('export')}><FileText size={15} /> Export</button>
  </div>
  if (mode === 'summary') return <AiInsightsDrawer {...synthesis} tabs={tabs} />
  return <aside className="sb-insights" aria-label="Board insights" {...other}>
    <header className="sb-insights-heading">
      <span className="sb-insight-icon">{mode === 'gaps' ? <CircleHelp size={18} /> : <FileText size={18} />}</span>
      <h2>{mode === 'gaps' ? 'Challenge the board' : 'Action brief'}</h2>
      <button type="button" className="sb-small-control" onClick={onClose} aria-label="Close insights"><X size={18} /></button>
    </header>
    {tabs}
    <div className="sb-insights-body">
      {mode === 'export' ? <ActionBrief title={title} markdown={markdown} /> : <>
        {busy && <p role="status" className="sb-insights-loading">Looking for blind spots…</p>}
        {error && <p role="alert" className="sb-studio-error">{error}</p>}
        {gaps && <>
          <p className="sb-insight-fine">Based on {gaps.included} of {gaps.total} notes</p>
          {!gaps.gaps.length && <p className="sb-insight-fine">The analysis found no gaps it could link to these notes.</p>}
          <ul className="sb-gap-list">{gaps.gaps.map((gap, index) => <li key={index}>
            <button type="button" className="sb-theme-card" aria-pressed={activeGap === index} onClick={() => onGap(activeGap === index ? null : index)}>
              <strong>{gap.title}</strong><span>{gap.detail}</span><small>{gap.noteIds.length} linked {gap.noteIds.length === 1 ? 'note' : 'notes'}</small>
            </button>
            <button type="button" className="sb-insight-regenerate" disabled={!canAdd || working} onClick={() => onGapNote(gap.prompt, index)}>
              <Plus size={15} /> Drop as prompt note
            </button>
          </li>)}</ul>
        </>}
        {!busy && <button type="button" className="sb-insight-regenerate" disabled={!canGenerate || working} onClick={onGenerate}>
          <Sparkles size={15} /> {gaps || error ? 'Find gaps again' : 'Find gaps'}
        </button>}
      </>}
    </div>
  </aside>
}
