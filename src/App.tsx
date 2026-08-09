import './App.css'

import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom'

import AccountEntryPage from './pages/AccountEntryPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import HomePage from './pages/HomePage'
import OnboardingGate from './pages/OnboardingGate'
import OnboardingPage from './pages/OnboardingPage'
import ProtectedRoute from './pages/ProtectedRoute'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import WelcomePage from './pages/WelcomePage'

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Navigate
        to="/welcome"
        replace
      />
    ),
  },

  {
    path: '/welcome',
    element: <WelcomePage />,
  },

  {
    path: '/signup',
    element: <SignUpPage />,
  },

  {
    path: '/signin',
    element: <SignInPage />,
  },

  {
    path: '/verify-email',
    element: <VerifyEmailPage />,
  },

  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },

  {
    path: '/account-entry',
    element: (
      <ProtectedRoute>
        <AccountEntryPage />
      </ProtectedRoute>
    ),
  },

  {
    path: '/onboarding',
    element: (
      <ProtectedRoute>
        <OnboardingPage />
      </ProtectedRoute>
    ),
  },

  {
    path: '/home',
    element: (
      <ProtectedRoute>
        <OnboardingGate>
          <HomePage />
        </OnboardingGate>
      </ProtectedRoute>
    ),
  },
])

function App() {
  return (
    <RouterProvider
      router={router}
    />
  )
}

export default App