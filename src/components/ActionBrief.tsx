import { Check, Copy, Download } from 'lucide-react'
import { useState } from 'react'
import { downloadActionBrief } from '@/lib/board-export'

export function ActionBrief({ title, markdown }: { title: string; markdown: string }) {
  const [status, setStatus] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setStatus('Markdown copied.')
    } catch {
      setStatus('Could not copy. Select the Markdown or download it.')
    }
  }
  return <section className="sb-action-brief">
    <div className="sb-insight-actions">
      <button type="button" onClick={() => void copy()}>{status === 'Markdown copied.' ? <Check size={15} /> : <Copy size={15} />} Copy Markdown</button>
      <button type="button" onClick={() => downloadActionBrief(title, markdown)}><Download size={15} /> Download .md file</button>
    </div>
    {status && <p role="status">{status}</p>}
    <textarea readOnly aria-label="Action brief Markdown" value={markdown} onFocus={(event) => event.currentTarget.select()} />
  </section>
}
