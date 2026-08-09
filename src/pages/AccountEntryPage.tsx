import { useEffect, useState } from 'react'
import {
  Navigate,
  useNavigate,
} from 'react-router-dom'

import { supabase } from '../lib/supabase'

function AccountEntryPage() {
  const navigate = useNavigate()

  const [isLoading, setIsLoading] =
    useState(true)

  const [isSignedIn, setIsSignedIn] =
    useState(true)

  useEffect(() => {
    let isMounted = true

    const routeUser = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!isMounted) {
        return
      }

      if (userError || !user) {
        setIsSignedIn(false)
        setIsLoading(false)
        return
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select(
          'id, onboarding_completed_at',
        )
        .eq('id', user.id)
        .maybeSingle()

      if (!isMounted) {
        return
      }

      if (profileError) {
        console.error(
          'Frankie profile lookup error:',
          profileError,
        )
      }

      if (!profile) {
        const {
          error: createProfileError,
        } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            onboarding_started_at:
              new Date().toISOString(),
          })

        if (createProfileError) {
          console.error(
            'Frankie profile creation error:',
            createProfileError,
          )
        }

        navigate('/onboarding', {
          replace: true,
        })

        return
      }

      if (!profile.onboarding_completed_at) {
        navigate('/onboarding', {
          replace: true,
        })

        return
      }

      navigate('/home', {
        replace: true,
      })
    }

    void routeUser()

    return () => {
      isMounted = false
    }
  }, [navigate])

  if (!isSignedIn) {
    return (
      <Navigate
        to="/signin"
        replace
      />
    )
  }

  if (isLoading) {
    return (
      <main className="route-loading">
        <span className="route-loading-dot" />

        Frankie is getting things ready...
      </main>
    )
  }

  return null
}

export default AccountEntryPage