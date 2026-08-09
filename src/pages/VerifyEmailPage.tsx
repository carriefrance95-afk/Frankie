import { useLocation } from 'react-router-dom'

import frankie from '../assets/frankie/frankie-main.png'

import './AuthPages.css'

type VerifyEmailState = {
  email?: string
}

function VerifyEmailPage() {
  const location = useLocation()

  const state =
    location.state as VerifyEmailState | null

  const email =
    state?.email ?? 'your email address'

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      <section className="auth-card">
        <div className="auth-frankie">
          <img
            src={frankie}
            alt="Frankie"
          />
        </div>

        <p className="auth-kicker">
          ONE QUICK THING
        </p>

        <h1>
          Check your email
        </h1>

        <p className="auth-intro">
          I sent a confirmation link to
          <strong> {email}</strong>.
        </p>

        <div className="verify-message">
          Open that email and confirm your
          address. Then I'll bring you back so
          we can get acquainted.
        </div>

        <p className="auth-small-print">
          You can close this tab after you've
          confirmed your email.
        </p>
      </section>
    </main>
  )
}

export default VerifyEmailPage