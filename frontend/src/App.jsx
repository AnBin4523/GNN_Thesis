import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

import Login       from './pages/Login'
import Register    from './pages/Register'
import Onboarding  from './pages/Onboarding'
import Home        from './pages/Home'
import MovieDetail from './pages/MovieDetail'
import Recommend   from './pages/Recommend'
import Compare     from './pages/Compare'
import Graph       from './pages/Graph'
import Metrics     from './pages/Metrics'
import Profile     from './pages/Profile'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login"      element={<Login />} />
      <Route path="/register"   element={<Register />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/"           element={<PrivateRoute><Home /></PrivateRoute>} />
      <Route path="/movies/:id" element={<PrivateRoute><MovieDetail /></PrivateRoute>} />
      <Route path="/recommend"  element={<PrivateRoute><Recommend /></PrivateRoute>} />
      <Route path="/compare"    element={<PrivateRoute><Compare /></PrivateRoute>} />
      <Route path="/graph"      element={<PrivateRoute><Graph /></PrivateRoute>} />
      <Route path="/metrics"    element={<PrivateRoute><Metrics /></PrivateRoute>} />
      <Route path="/profile"    element={<PrivateRoute><Profile /></PrivateRoute>} />
      <Route path="*"           element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}