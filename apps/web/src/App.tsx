import { Routes, Route, Navigate } from "react-router"
import { ProtectedRoute } from "./components/layout/protected-route"
import { EventProvider } from "./hooks/use-event"
import LoginPage from "./pages/login"
import RegisterPage from "./pages/register"
import VerifyEmailPage from "./pages/verify-email"
import DashboardPage from "./pages/dashboard"
import SettingsPage from "./pages/settings"

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register/:inviteToken" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <EventProvider>
              <DashboardPage />
            </EventProvider>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <EventProvider>
              <SettingsPage />
            </EventProvider>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
