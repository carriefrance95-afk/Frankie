import { useNavigate } from 'react-router-dom'

function WelcomePage() {
  const navigate = useNavigate()

  return (
    <main className="app-shell">
      <section className="welcome-card">
        <div className="eyebrow">Feather & Fire</div>

        <h1>Frankie</h1>

        <p className="tagline">
          The Entrepreneur&apos;s Operating System
        </p>

        <p className="mission">
          Hi! I&apos;m Frankie. I&apos;m here to help you organize your business,
          simplify your day, and stay focused on what matters most.
        </p>

        <p className="mission">
          We don&apos;t have to figure everything out today. We&apos;ll build your
          workspace together.
        </p>

        <button
          type="button"
          className="primary-button"
          onClick={() => navigate('/home')}
        >
          Let&apos;s Get Started
        </button>
      </section>
    </main>
  )
}

export default WelcomePage