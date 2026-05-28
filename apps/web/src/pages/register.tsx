import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router"
import { api } from "../lib/api"
import { Button } from "@workspace/ui/components/button"

export default function RegisterPage() {
  const { inviteToken } = useParams<{ inviteToken: string }>()
  const navigate = useNavigate()
  const [inviteInfo, setInviteInfo] = useState<{
    defaultRole: string
    allowedEmailDomains: string[] | null
  } | null>(null)
  const [inviteError, setInviteError] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!inviteToken) return
    api<{ defaultRole: string; allowedEmailDomains: string[] | null }>(
      `/auth/invite/${inviteToken}`
    )
      .then(setInviteInfo)
      .catch((err: unknown) =>
        setInviteError(err instanceof Error ? err.message : "Invalid invite")
      )
  }, [inviteToken])

  if (inviteError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-bold">Invalid Invite</h1>
          <p className="text-muted-foreground">{inviteError}</p>
          <Button variant="outline" onClick={() => navigate("/login")}>
            Go to Login
          </Button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ inviteToken, name, email, password }),
      })
      navigate(`/verify-email?email=${encodeURIComponent(email)}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8888/api"

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Create Account</h1>
          {inviteInfo && (
            <p className="text-sm text-muted-foreground">
              You'll join as: {inviteInfo.defaultRole}
              {inviteInfo.allowedEmailDomains && (
                <>
                  {" "}
                  (email must end with @
                  {inviteInfo.allowedEmailDomains.join(" or @")})
                </>
              )}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              minLength={8}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            window.location.href = `${API_BASE}/auth/google?inviteToken=${inviteToken}`
          }}
        >
          Sign up with Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
