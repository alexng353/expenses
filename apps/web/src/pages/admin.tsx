import { useState } from "react"
import { Link } from "react-router"
import { AppShell } from "../components/layout/app-shell"
import { useAuth } from "../hooks/use-auth"
import { useEvent } from "../hooks/use-event"
import {
  useAllUsers,
  useCreateUser,
  useArchiveUser,
  useUnarchiveUser,
  useCreateEvent,
} from "../hooks/use-event-mutations"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { ArrowLeft } from "lucide-react"

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function UsersSection() {
  const { data: users = [], isLoading } = useAllUsers()
  const createUser = useCreateUser()
  const archiveUser = useArchiveUser()
  const unarchiveUser = useUnarchiveUser()

  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [isSuper, setIsSuper] = useState(false)
  const [error, setError] = useState("")

  const handleCreate = async () => {
    setError("")
    if (!email.trim() || !name.trim()) {
      setError("Email and name are required")
      return
    }
    try {
      await createUser.mutateAsync({
        email: email.trim(),
        name: name.trim(),
        isSuper,
      })
      setEmail("")
      setName("")
      setIsSuper(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user")
    }
  }

  return (
    <Section
      title="Users"
      description="Manage platform accounts. Creating a user sends them a setup email."
    >
      <div className="space-y-2">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading users...</p>
        )}
        {!isLoading && users.length === 0 && (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        )}
        {users.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 truncate font-medium">
                {u.name}
                {u.isSuper && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-normal text-primary">
                    super
                  </span>
                )}
                {u.archived && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                    archived
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {u.email}
              </div>
            </div>

            {u.archived ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={unarchiveUser.isPending}
                onClick={() => unarchiveUser.mutate(u.id)}
              >
                Unarchive
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={archiveUser.isPending}
                onClick={() => archiveUser.mutate(u.id)}
              >
                Archive
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-3 border-t pt-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-user-email">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-user-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={isSuper}
            onCheckedChange={(checked) => setIsSuper(checked === true)}
          />
          Platform super admin
        </label>

        <div className="flex items-center gap-3">
          <Button onClick={handleCreate} disabled={createUser.isPending}>
            {createUser.isPending ? "Creating..." : "Create user"}
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </div>
    </Section>
  )
}

function CreateEventSection() {
  const { setCurrentEventId } = useEvent()
  const createEvent = useCreateEvent()
  const [name, setName] = useState("")
  const [grantMode, setGrantMode] = useState(false)
  const [error, setError] = useState("")

  const handleCreate = async () => {
    setError("")
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    try {
      const event = await createEvent.mutateAsync({
        name: name.trim(),
        grantMode,
      })
      setCurrentEventId(event.id)
      setName("")
      setGrantMode(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event")
    }
  }

  return (
    <Section
      title="Create new event"
      description="Creates a new event and switches to it."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-event-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-event-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Event name"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={grantMode}
            onCheckedChange={(checked) => setGrantMode(checked === true)}
          />
          Grant Mode
        </label>

        <div className="flex items-center gap-3">
          <Button onClick={handleCreate} disabled={createEvent.isPending}>
            {createEvent.isPending ? "Creating..." : "Create"}
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </div>
    </Section>
  )
}

export default function AdminPage() {
  const { user } = useAuth()

  if (!user?.isSuper) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-muted-foreground">
            You are not authorized to view this page.
          </p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>

          <h1 className="mb-6 text-xl font-bold">Platform Admin</h1>

          <div className="space-y-6">
            <UsersSection />
            <CreateEventSection />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
