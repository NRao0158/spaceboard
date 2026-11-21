import type { ReactNode } from 'react'
import { LayoutGrid, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import { BoardMarkdown } from './BoardMarkdown'
import type { BoardSummary } from '@/lib/theme-layout'

type Props = {
  tabs?: ReactNode
  summary?: BoardSummary; busy: boolean; error: string; theme: number | null
  onTheme: (index: number | null) => void; onClose: () => void; onGenerate: () => void
  onAdd: (step: string, index: number) => Promise<void>; onArrange: () => void; onUndo: () => void
  working: boolean; canAdd: boolean; canUndo: boolean; canGenerate: boolean
}

export function AiInsightsDrawer({ summary, busy, error, theme, onTheme, onClose, onGenerate, onAdd, onArrange, onUndo, working, canAdd, canUndo, canGenerate, tabs }: Props) {
  return (
    <aside className="sb-insights" aria-label="Board insights">
      <header className="sb-insights-heading">
        <span className="sb-insight-icon"><Sparkles size={18} aria-hidden="true" /></span>
        <h2>Board insights</h2>
        <button type="button" className="sb-small-control" onClick={onClose} aria-label="Close insights"><X size={18} /></button>
      </header>
      {tabs}
      <div className="sb-insights-body">
        {busy && <div role="status" className="sb-insights-loading">Reading the board <span className="sb-loading-dots" aria-hidden="true"><i /><i /><i /></span></div>}
        {error && <p role="alert" className="sb-studio-error">{error}</p>}
        {summary && (
          <>
            <p className="sb-insight-fine">Based on {summary.included} of {summary.total} notes</p>
            <div className="sb-insight-summary"><BoardMarkdown source={summary.summary} /></div>
            {summary.themes.length > 0 && (
              <section className="sb-insight-section">
                <h3>Themes</h3>
                {summary.themes.map((item, index) => (
                  <button type="button" key={index} aria-pressed={theme === index} className="sb-theme-card" onClick={() => onTheme(theme === index ? null : index)}>
                    <strong>{item.name}</strong><span>{item.detail}</span><small>{item.noteIds.length} linked {item.noteIds.length === 1 ? 'note' : 'notes'}</small>
                  </button>
                ))}
                <div className="sb-insight-actions">
                  <button type="button" disabled={working} onClick={onArrange}><LayoutGrid size={15} /> Arrange by theme</button>
                  {canUndo && <button type="button" disabled={working} onClick={onUndo}><RotateCcw size={15} /> Undo layout</button>}
                </div>
              </section>
            )}
            {!summary.themes.length && canUndo && <div className="sb-insight-actions"><button type="button" disabled={working} onClick={onUndo}><RotateCcw size={15} /> Undo layout</button></div>}
            {summary.nextSteps.length > 0 && (
              <section className="sb-insight-section">
                <h3>Next steps</h3>
                <ul>{summary.nextSteps.map((step, index) => (
                  <li key={index}><p>{step}</p><button type="button" disabled={working || !canAdd} onClick={() => void onAdd(step, index)}><Plus size={15} /> Add to board</button></li>
                ))}</ul>
              </section>
            )}
          </>
        )}
        {!busy && <button className="sb-insight-regenerate" type="button" disabled={working || !canGenerate} onClick={onGenerate}><RotateCcw size={15} /> {summary || error ? 'Generate again' : 'Generate insights'}</button>}
      </div>
    </aside>
  )
}
