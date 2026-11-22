import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type StudioCommand = { id: string; label: string; keywords: string; icon: LucideIcon; group: 'Action' | 'Sticky note'; run: () => void }
type CommandSource = { current: (() => StudioCommand[]) | null }
const BoardCommands = createContext<CommandSource | null>(null)

export function StudioCommandsProvider({ children }: { children: ReactNode }) {
  const source = useRef<CommandSource['current']>(null)
  return <BoardCommands.Provider value={source}>{children}</BoardCommands.Provider>
}

export function useStudioCommandSource() {
  return useContext(BoardCommands)
}

export function useStudioCommands(commands: () => StudioCommand[]) {
  const source = useStudioCommandSource()
  const latest = useRef(commands)
  latest.current = commands
  useEffect(() => {
    if (!source) return
    const get = () => latest.current()
    source.current = get
    return () => { if (source.current === get) source.current = null }
  }, [source])
}
