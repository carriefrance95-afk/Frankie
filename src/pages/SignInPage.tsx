import type React from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import frankie from '../assets/frankie/frankie-main.png'
import { supabase } from '../lib/supabase'

import './AuthPages.css'

function SignInPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (
  event: React.SyntheticEvent<HTMLFormElement>,
) => {
    event.preventDefault()

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const { error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

      if (error) {
        setErrorMessage(
          'That email or password did not work.',
        )
        return
      }

      navigate('/account-entry', {
        replace: true,
      })
    } catch (error) {
      console.error(
        'Frankie sign in error:',
        error,
      )

      setErrorMessage(
        'Something went wrong signing you in. Try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

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
          WELCOME BACK
        </p>

        <h1>
          Sign in to Frankie
        </h1>

        <p className="auth-intro">
          Pick up where you left off.
        </p>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          <label>
            <span>Email</span>

            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="you@yourbusiness.com"
              disabled={isSubmitting}
            />
          </label>

          <label>
            <span>Password</span>

            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="Your password"
              disabled={isSubmitting}
            />
          </label>

          {errorMessage && (
            <div className="auth-error">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            className="auth-primary-button"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Signing in...'
              : 'Sign In'}
          </button>
        </form>

        <p className="auth-switch">
          New to Frankie?{' '}
          <Link to="/signup">
            Create an account
          </Link>
        </p>

        <Link
          className="auth-back-link"
          to="/welcome"
        >
          ← Back to Frankie
        </Link>
      </section>
    </main>
  )
}

export default SignInPage