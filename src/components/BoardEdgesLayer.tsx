import { useId } from 'react'
import { edgeCurve, type BoardEdge, type Port, PORTS } from '@/lib/board-edges'
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Point } from '@/schemas/board-schema'
import type { PointerEvent } from 'react'

export function NotePorts({ onStart }: { onStart: (event: PointerEvent<HTMLButtonElement>, port: Port) => void }) {
  return <>{PORTS.map((port) => <button className="sb-connector-port" key={port} type="button"
    data-port={port} aria-label={'Connect from ' + port} tabIndex={-1} onPointerDown={(event) => onStart(event, port)} />)}</>
}

export function BoardEdgesLayer({ edges, positions, selected, onSelect, preview }: {
  edges: BoardEdge[]; positions: ReadonlyMap<string, Point>; selected?: string
  onSelect?: (id: string) => void; preview?: string
}) {
  const markerId = 'thread-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return <svg className="sb-edges-layer" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-label="Idea threads">
    <defs><marker id={markerId} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0 0 L9 4.5 L0 9 Z" fill="context-stroke" />
    </marker></defs>
    {edges.map((edge) => {
      const from = positions.get(edge.fromNoteId)
      const to = positions.get(edge.toNoteId)
      if (!from || !to) return null
      const { path, label } = edgeCurve(from, to)
      const labelWidth = Math.max(28, Math.min(300, (edge.label?.length ?? 0) * 7 + 17))
      return <g key={edge.id} data-edge-id={edge.id} data-selected={selected === edge.id} className="sb-board-edge">
        <path className="sb-edge-visible" d={path} strokeDasharray={edge.style === 'dashed' ? '7 5' : undefined} markerEnd={'url(#' + markerId + ')'} />
        {onSelect && <path className="sb-edge-hit" d={path} role="button" tabIndex={0} aria-label={edge.label ? 'Thread: ' + edge.label : 'Select idea thread'}
          onClick={() => onSelect(edge.id)} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(edge.id) }
          }} />}
        {edge.label && <g className="sb-edge-label" transform={'translate(' + label.x + ' ' + label.y + ')'}>
          <rect x={-labelWidth / 2} y="-11" width={labelWidth} height="22" rx="9" />
          <text textAnchor="middle" dominantBaseline="central">{edge.label}</text>
        </g>}
      </g>
    })}
    {preview && <path className="sb-edge-preview" d={preview} markerEnd={'url(#' + markerId + ')'} />}
  </svg>
}
