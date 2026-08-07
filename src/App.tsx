import './App.css'
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom'

import HomePage from './pages/HomePage'
import WelcomePage from './pages/WelcomePage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/welcome" replace />,
  },
  {
    path: '/welcome',
    element: <WelcomePage />,
  },
  {
    path: '/home',
    element: <HomePage />,
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App