import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import frankie from '../assets/frankie/frankie-conversation.png'
import { supabase } from '../lib/supabase'

import './AuthPages.css'

function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    const finishAuthentication = async () => {
      const { data, error } =
        await supabase.auth.getSession()

      if (!isMounted) {
        return
      }

      if (error) {
        console.error(
          'Frankie auth callback error:',
          error,
        )

        navigate('/signin', {
          replace: true,
        })

        return
      }

      if (data.session) {
        navigate('/account-entry', {
          replace: true,
        })

        return
      }

      /*
       * Supabase may still be processing the
       * confirmation URL when this page first
       * mounts. Auth state changes will catch it.
       */
    }

    void finishAuthentication()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted || !session) {
          return
        }

        navigate('/account-entry', {
          replace: true,
        })
      },
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [navigate])

  return (
    <main className="auth-page">
      <section className="auth-card auth-processing-card">
        <div className="auth-frankie">
          <img
            src={frankie}
            alt="Frankie"
          />
        </div>

        <p className="auth-kicker">
          GOT IT
        </p>

        <h1>
          Bringing you in...
        </h1>

        <p className="auth-intro">
          Give me a second while I finish
          setting up your account.
        </p>
      </section>
    </main>
  )
}

export default AuthCallbackPage