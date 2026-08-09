import {
  type ReactNode,
  useEffect,
  useState,
} from 'react'

import { Navigate } from 'react-router-dom'

import { supabase } from '../lib/supabase'

type OnboardingGateProps = {
  children: ReactNode
}

type GateStatus =
  | 'checking'
  | 'needs-onboarding'
  | 'ready'

function OnboardingGate({
  children,
}: OnboardingGateProps) {
  const [status, setStatus] =
    useState<GateStatus>('checking')

  useEffect(() => {
    let isMounted = true

    const checkOnboarding = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        if (isMounted) {
          setStatus('needs-onboarding')
        }

        return
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('onboarding_completed_at')
        .eq('id', user.id)
        .maybeSingle()

      if (!isMounted) {
        return
      }

      if (profileError) {
        console.error(
          'Could not check onboarding status:',
          profileError,
        )

        setStatus('needs-onboarding')
        return
      }

      if (!profile?.onboarding_completed_at) {
        setStatus('needs-onboarding')
        return
      }

      setStatus('ready')
    }

    void checkOnboarding()

    return () => {
      isMounted = false
    }
  }, [])

  if (status === 'checking') {
    return null
  }

  if (status === 'needs-onboarding') {
    return (
      <Navigate
        to="/onboarding"
        replace
      />
    )
  }

  return <>{children}</>
}

export default OnboardingGate