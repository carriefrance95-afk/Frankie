import type React from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import frankie from '../assets/frankie/frankie-conversation.png'
import { supabase } from '../lib/supabase'

import './AuthPages.css'

function SignUpPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

const handleSubmit = async (
  event: React.SyntheticEvent<HTMLFormElement>,
) => {
    event.preventDefault()

    setErrorMessage('')

    if (!email.trim()) {
      setErrorMessage('Enter your email address.')
      return
    }

    if (password.length < 8) {
      setErrorMessage(
        'Use a password with at least 8 characters.',
      )
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage(
        'Those passwords do not match.',
      )
      return
    }

    setIsSubmitting(true)

    try {
      const redirectUrl =
        `${window.location.origin}/auth/callback`

      const { data, error } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,

          options: {
            emailRedirectTo: redirectUrl,
          },
        })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      if (data.session) {
        navigate('/onboarding', {
          replace: true,
        })

        return
      }

      navigate('/verify-email', {
        replace: true,
        state: {
          email: email.trim(),
        },
      })
    } catch (error) {
      console.error(
        'Frankie signup error:',
        error,
      )

      setErrorMessage(
        'Something went wrong creating your account. Try again.',
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
          FEATHER &amp; FIRE
        </p>

        <h1>
          Create your Frankie account
        </h1>

        <p className="auth-intro">
          One account. All your businesses.
          Frankie will learn the rest when you
          meet her.
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
              autoComplete="new-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="At least 8 characters"
              disabled={isSubmitting}
            />
          </label>

          <label>
            <span>Confirm password</span>

            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value,
                )
              }
              placeholder="Type it again"
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
              ? 'Creating account...'
              : 'Create My Account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have Frankie?{' '}
          <Link to="/signin">
            Sign in
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

export default SignUpPage