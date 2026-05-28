import { Routes, Route, Navigate } from "react-router"
import { ProtectedRoute } from "./components/layout/protected-route"
import { EventProvider } from "./hooks/use-event"
import LoginPage from "./pages/login"
import RegisterPage from "./pages/register"
import VerifyEmailPage from "./pages/verify-email"
import AppSwitcher from "./pages/app-switcher"
import DashboardPage from "./pages/dashboard"
import SettingsPage from "./pages/settings"
import EventsManagePage from "./pages/events-manage"
import AdminUsersPage from "./pages/admin-users"

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
            <AppSwitcher />
          </ProtectedRoute>
        }
      />
      <Route
        path="/events"
        element={
          <ProtectedRoute>
            <EventProvider>
              <DashboardPage />
            </EventProvider>
          </ProtectedRoute>
        }
      />
      <Route
        path="/events/manage"
        element={
          <ProtectedRoute>
            <EventProvider>
              <EventsManagePage />
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
      <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute>
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
