import { Navigate } from 'react-router-dom'
import { BoardCanvasLayout } from '@/components/BoardCanvas'

export default function BoardPreview() {
  if (!import.meta.env.DEV) return <Navigate to="/" replace />

  // Use the same canvas layout as the signed-in route, with an empty fixture.
  return (
    <main className="flex min-h-dvh bg-slate-50 p-3 sm:p-6">
      <title>Canvas preview | SpaceBoard</title>
      <BoardCanvasLayout title="Brainstorm" />
    </main>
  )
}
