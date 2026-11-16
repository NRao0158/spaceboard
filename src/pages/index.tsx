import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { APP_NAME } from '../constants'
import { seo } from '../seo'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <main
        data-testid="static-landing"
        className="grid min-h-dvh place-items-center bg-slate-50 px-6 text-center text-slate-950"
      >
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-semibold text-indigo-700">{APP_NAME}</p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            A shared canvas for brainstorming
          </h1>
          <Link
            to={import.meta.env.DEV ? '/board-preview' : '/home'}
            className="mt-8 inline-flex rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-700"
          >
            {import.meta.env.DEV ? 'Preview the canvas' : 'Open SpaceBoard'}
          </Link>
        </div>
      </main>
    </>
  )
}
