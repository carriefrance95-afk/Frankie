import { useNavigate } from 'react-router-dom'

import featherFireLogo from '../assets/feather-fire-logo.png'
import frankie from '../assets/frankie/frankie-main.png'

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
          <div className="logo-crop">
            <img
              className="feather-fire-logo"
              src={featherFireLogo}
              alt="Feather & Fire"
            />
          </div>

          <div className="welcome-conversation">
            <h1 className="welcome-title">
              Hi. I&apos;m Frankie.
            </h1>

            <div className="ember-divider" />

            <p className="welcome-opening">
              Running a business can be a lot.
            </p>

            <div className="welcome-rhythm">
              <p>Too much to remember.</p>
              <p>Too many things competing for your attention.</p>
              <p>Too many tabs open — literally and mentally.</p>
            </div>

            <p className="welcome-emphasis">
              That&apos;s where I come in.
            </p>

            <p className="welcome-body">
              I&apos;ll help you keep track of what matters, organize the chaos,
              and stay ahead of what&apos;s coming next.
            </p>

            <p className="welcome-final-line">
              <strong>
                You run the business. I&apos;ll help you keep it together.
              </strong>
            </p>

            <button
              type="button"
              className="fire-button"
              onClick={() => navigate('/home')}
            >
              <span className="fire-button-spark">✦</span>
              <span>Let&apos;s Get Started</span>
            </button>
          </div>
        </div>

        <div className="frankie-stage" aria-label="Frankie">
          <div className="frankie-aura" aria-hidden="true" />
          <div className="frankie-floor-glow" aria-hidden="true" />
          <div className="frankie-contact-glow" aria-hidden="true" />

          <img
            className="frankie-character"
            src={frankie}
            alt="Frankie"
          />
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