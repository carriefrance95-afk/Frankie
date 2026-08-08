import { useNavigate } from 'react-router-dom'

import featherFireLogo from '../assets/feather-fire-logo.png'
import frankie from '../assets/frankie.png'

function WelcomePage() {
  const navigate = useNavigate()

  return (
    <main className="frankie-welcome">
      <div className="welcome-ember-glow welcome-ember-glow-left" />
      <div className="welcome-ember-glow welcome-ember-glow-right" />

      <div className="floating-embers" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <section className="welcome-stage">
        <div className="welcome-content">
          <img
            className="feather-fire-logo"
            src={featherFireLogo}
            alt="Feather & Fire"
          />

          <div className="welcome-heading">
            <p className="welcome-eyebrow">WELCOME TO</p>

            <h1 className="welcome-title">Frankie</h1>

            <p className="welcome-tagline">
              The Entrepreneur&apos;s Operating System
            </p>
          </div>

          <div className="ember-divider" />

          <div className="welcome-intro">
            <p>
              Hi! I&apos;m Frankie. I&apos;m here to help you organize your
              business, simplify your day, and stay focused on what matters
              most.
            </p>

            <p>
              We don&apos;t have to figure everything out today.
              <br />
              We&apos;ll build this together.
            </p>
          </div>

          <button
            type="button"
            className="fire-button"
            onClick={() => navigate('/home')}
          >
            <span className="fire-button-spark">✦</span>
            <span>Let&apos;s Get Started</span>
          </button>
        </div>

        <div className="frankie-stage" aria-label="Frankie">
          <div className="frankie-aura" />
          <div className="frankie-floor-glow" />

          <img
            className="frankie-character"
            src={frankie}
            alt="Frankie, your entrepreneurial operating partner"
          />

          <div className="frankie-whisper">
            <span>We&apos;ll figure it out.</span>
            <strong>Together.</strong>
          </div>
        </div>
      </section>

      <footer className="welcome-footer">
        <span>FEATHER &amp; FIRE</span>
        <span className="footer-flame">✦</span>
        <span>TOOLS · TEMPLATES · TRANSFORMATION</span>
      </footer>
    </main>
  )
}

export default WelcomePage