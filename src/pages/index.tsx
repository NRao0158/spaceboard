import { ArrowDown, ArrowRight, MousePointer2, Sparkles, StickyNote } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Magnetic } from '@/components/SurfaceEffects'
import { HeroBoardPreview } from '@/components/HeroBoardPreview'
import { useScrollReveal } from '@/lib/surface-motion'
import { seo } from '../seo'

function WorkspaceLink() {
  return (
    <Magnetic>
      <Link to="/home" className="sb-action sb-action--lilac">
        Open workspace <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </Magnetic>
  )
}

export default function Landing() {
  const sections = useScrollReveal()

  return (
    <>
      <Seo {...seo} path="/" />
      <main ref={sections} data-testid="static-landing" className="sb-landing">
        <div className="sb-hero">
          <header className="sb-landing-nav">
            <Link to="/" aria-label="SpaceBoard home" className="sb-wordmark">
              <span className="sb-brand-mark"><StickyNote size={20} aria-hidden="true" /></span>SpaceBoard
            </Link>
            <div className="sb-landing-nav-actions">
              <WorkspaceLink />
            </div>
          </header>

          <div className="sb-hero-layout">
            <div className="sb-hero-copy">
              <h1 data-sb-reveal>Make room<br />for <span>ideas.</span></h1>
              <p data-sb-reveal>A shared canvas to collect ideas, think together, and leave with a next step.</p>
              <div className="sb-hero-actions" data-sb-reveal>
                <WorkspaceLink />
                <a href="#how-it-works" className="sb-explore">See how it works <ArrowDown size={16} aria-hidden="true" /></a>
              </div>
            </div>

            <HeroBoardPreview />
          </div>
        </div>

        <section id="how-it-works" className="sb-workflow">
          <div className="sb-workflow-heading" data-sb-reveal>
            <h2>From a blank board to a plan.</h2>
          </div>
          <div className="sb-workflow-grid">
            <article className="sb-feature sb-feature--capture" data-sb-reveal>
              <StickyNote size={23} aria-hidden="true" />
              <div>
                <h3>Get ideas on the board.</h3>
                <p>Write in Markdown, give related notes the same color, and move them around as the discussion develops.</p>
              </div>
              <div className="sb-color-samples" aria-hidden="true"><i /><i /><i /><i /></div>
            </article>
            <article className="sb-feature sb-feature--collab" data-sb-reveal>
              <MousePointer2 size={23} aria-hidden="true" />
              <div>
                <h3>Share the room.</h3>
                <p>Invite someone with a link and see their notes and cursor as you work.</p>
              </div>
            </article>
            <article className="sb-feature sb-feature--summary" data-sb-reveal>
              <Sparkles size={23} aria-hidden="true" />
              <div>
                <h3>Find the common threads.</h3>
                <p>Summarize the board into themes and possible next steps.</p>
              </div>
            </article>
          </div>
        </section>
        <footer className="sb-landing-footer">
          <Link to="/" className="sb-wordmark"><StickyNote size={18} aria-hidden="true" /> SpaceBoard</Link>
        </footer>
      </main>
    </>
  )
}
