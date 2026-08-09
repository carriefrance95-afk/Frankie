import {
  useEffect,
  useState,
} from 'react'

import type { ReactNode } from 'react'

import { useNavigate } from 'react-router-dom'

import { supabase } from '../lib/supabase'

type ProtectedRouteProps = {
  children: ReactNode
}

function ProtectedRoute({
  children,
}: ProtectedRouteProps) {
  const navigate = useNavigate()

  const [status, setStatus] = useState<
    'checking' | 'signed-in' | 'signed-out'
  >('checking')

  useEffect(() => {
    let isMounted = true

    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!isMounted) {
        return
      }

      if (user) {
        setStatus('signed-in')
      } else {
        setStatus('signed-out')

        navigate('/signin', {
          replace: true,
        })
      }
    }

    void checkUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) {
          return
        }

        if (session) {
          setStatus('signed-in')
        } else {
          setStatus('signed-out')

          navigate('/signin', {
            replace: true,
          })
        }
      },
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [navigate])

  if (status !== 'signed-in') {
    return (
      <main className="route-loading">
        <span className="route-loading-dot" />

        Frankie is checking your account...
      </main>
    )
  }

  return <>{children}</>
}

export default ProtectedRoute