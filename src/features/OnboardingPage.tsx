import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function OnboardingPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')

  return (
    <main className="app-shell">
      <section className="welcome-card">

        <div className="eyebrow">
          Frankie
        </div>

        <h1>Nice to meet you.</h1>

        <p className="mission">
          Before we organize your business, let's get to know each other.
        </p>

        <input
          className="text-input"
          placeholder="What should I call you?"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button
          className="primary-button"
          disabled={!name.trim()}
          onClick={() => navigate('/home')}
        >
          Continue
        </button>

      </section>
    </main>
  )
}

export default OnboardingPage