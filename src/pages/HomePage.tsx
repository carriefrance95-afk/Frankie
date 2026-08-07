import { Link } from 'react-router-dom'

function HomePage() {
  return (
    <main className="app-shell">
      <section className="welcome-card">
        <div className="eyebrow">Frankie</div>

        <h1>Home</h1>

        <p className="tagline">
          This is where your day will come together.
        </p>

        <p className="mission">
          Today&apos;s focus, calendar, businesses, ideas, and everything that
          needs your attention will eventually live here.
        </p>

        <Link className="text-link" to="/welcome">
          Back to Welcome
        </Link>
      </section>
    </main>
  )
}

export default HomePage