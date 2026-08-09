import { useNavigate } from 'react-router-dom'

function OnboardingPlaceholderPage() {
  const navigate = useNavigate()

  return (
    <main className="route-loading">
      <div className="onboarding-placeholder">
        <span className="route-loading-dot" />

        <h1>
          You're in.
        </h1>

        <p>
          This is where you'll meet Frankie.
          We're building that conversation next.
        </p>

        <button
          type="button"
          className="auth-primary-button"
          onClick={() =>
            navigate('/home')
          }
        >
          Enter Workspace for Testing
        </button>
      </div>
    </main>
  )
}

export default OnboardingPlaceholderPage