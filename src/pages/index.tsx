import { ArrowRight, StickyNote } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <main data-testid="static-landing" className="min-h-dvh bg-[#f6f6fb] text-slate-950">
        <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-12 px-6 py-14 md:grid-cols-[1fr_0.95fr] lg:px-12">
          <div className="max-w-xl">
            <div className="mb-7 flex items-center gap-3 text-lg font-semibold tracking-tight">
              <span className="grid size-11 place-items-center rounded-xl bg-indigo-700 text-white"><StickyNote className="size-6" aria-hidden="true" /></span>
              SpaceBoard
            </div>
            <h1 className="text-balance text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
              A shared canvas for your next brainstorm
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-600">
              Capture ideas on sticky notes, share the board, and turn the discussion into a short summary.
            </p>
            <Link
              to="/home"
              className="mt-7 inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-700"
            >
              Open SpaceBoard <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-indigo-950/8" aria-hidden="true">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <span className="font-semibold">Project kickoff</span>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600"><span className="size-2 rounded-full bg-emerald-600" /> Live</span>
            </div>
            <div className="grid min-h-64 grid-cols-2 content-center gap-3 bg-[#fbfaff] bg-[radial-gradient(#cdd1e4_1px,transparent_1px)] bg-size-[18px_18px] px-4 py-6 sm:gap-4 sm:p-6">
              <div className="rounded-xl border border-amber-200 bg-[#fff1ac] p-3 text-sm leading-relaxed shadow-sm sm:p-4">
                <strong>What should we try?</strong><p className="mt-2">Start with a small experiment.</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-[#caf0df] p-3 text-sm leading-relaxed shadow-sm sm:p-4">
                <strong>What will we measure?</strong><p className="mt-2">See what people find useful.</p>
              </div>
              <div className="col-start-1 rounded-xl border border-violet-200 bg-[#e8ddff] p-3 text-sm leading-relaxed shadow-sm sm:p-4">
                <strong>Next step</strong><p className="mt-2">Compare findings on Friday.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
