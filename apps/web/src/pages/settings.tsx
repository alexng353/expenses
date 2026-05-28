import { useState } from "react"
import { Link } from "react-router"
import { AppShell } from "../components/layout/app-shell"
import { useAuth } from "../hooks/use-auth"
import { useEvent } from "../hooks/use-event"
import {
  useUpdateEvent,
  useCreateBucket,
  useDeleteBucket,
  useCreateGrantCategory,
  useDeleteGrantCategory,
  useAddMember,
  useUpdateMember,
  useRemoveMember,
  useCreateEvent,
  useAllUsers,
} from "../hooks/use-event-mutations"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Checkbox } from "@workspace/ui/components/checkbox"
import type { EventMember } from "../lib/types"
import { ArrowLeft, X } from "lucide-react"

const SELECT_CLASS =
  "h-9 w-full appearance-none rounded-lg border border-input bg-background px-2.5 py-0 text-sm leading-9 outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"

const ROLES: EventMember["role"][] = [
  "readonly",
  "write",
  "edit_others",
  "super",
]

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

function EventDetailsSection({
  initialName,
  initialDescription,
  initialCurrency,
  initialGrantMode,
}: {
  initialName: string
  initialDescription: string
  initialCurrency: string
  initialGrantMode: boolean
}) {
  const updateEvent = useUpdateEvent()

  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [currency, setCurrency] = useState(initialCurrency)
  const [grantMode, setGrantMode] = useState(initialGrantMode)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const handleSave = async () => {
    setError("")
    setSaved(false)
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    try {
      await updateEvent.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        currency: currency.trim() || "CAD",
        grantMode,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    }
  }

  return (
    <Section title="Event details">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="event-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="event-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Event name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="event-description">Description</Label>
          <Input
            id="event-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="event-currency">Currency</Label>
          <Input
            id="event-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            placeholder="CAD"
            maxLength={3}
            className="w-28"
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
          <Button onClick={handleSave} disabled={updateEvent.isPending}>
            {updateEvent.isPending ? "Saving..." : "Save"}
          </Button>
          {saved && (
            <span className="text-sm text-muted-foreground">Saved</span>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </div>
    </Section>
  )
}

function BucketsSection() {
  const { buckets } = useEvent()
  const createBucket = useCreateBucket()
  const deleteBucket = useDeleteBucket()
  const [name, setName] = useState("")

  const handleAdd = async () => {
    if (!name.trim()) return
    await createBucket.mutateAsync({
      name: name.trim(),
      sortOrder: buckets.length,
    })
    setName("")
  }

  return (
    <Section title="Buckets">
      <div className="space-y-2">
        {buckets.length === 0 && (
          <p className="text-sm text-muted-foreground">No buckets yet.</p>
        )}
        {buckets.map((bucket) => (
          <div
            key={bucket.id}
            className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <span>{bucket.name}</span>
            <button
              type="button"
              aria-label={`Delete bucket ${bucket.name}`}
              className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
              disabled={deleteBucket.isPending}
              onClick={() => deleteBucket.mutate(bucket.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          handleAdd()
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New bucket name"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={createBucket.isPending || !name.trim()}
        >
          Add
        </Button>
      </form>
    </Section>
  )
}

function GrantCategoriesSection() {
  const { grantCategories } = useEvent()
  const createCategory = useCreateGrantCategory()
  const deleteCategory = useDeleteGrantCategory()
  const [name, setName] = useState("")

  const handleAdd = async () => {
    if (!name.trim()) return
    await createCategory.mutateAsync({
      name: name.trim(),
      sortOrder: grantCategories.length,
    })
    setName("")
  }

  return (
    <Section title="Grant Categories">
      <div className="space-y-2">
        {grantCategories.length === 0 && (
          <p className="text-sm text-muted-foreground">No categories yet.</p>
        )}
        {grantCategories.map((category) => (
          <div
            key={category.id}
            className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <span>{category.name}</span>
            <button
              type="button"
              aria-label={`Delete category ${category.name}`}
              className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
              disabled={deleteCategory.isPending}
              onClick={() => deleteCategory.mutate(category.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          handleAdd()
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={createCategory.isPending || !name.trim()}
        >
          Add
        </Button>
      </form>
    </Section>
  )
}

function MembersSection() {
  const { members } = useEvent()
  const { data: allUsers = [] } = useAllUsers()
  const addMember = useAddMember()
  const updateMember = useUpdateMember()
  const removeMember = useRemoveMember()
  const [addUserId, setAddUserId] = useState("")

  const memberUserIds = new Set(members.map((m) => m.userId))
  const availableUsers = allUsers.filter((u) => !memberUserIds.has(u.id))

  const handleAdd = async () => {
    if (!addUserId) return
    await addMember.mutateAsync({ userId: addUserId, role: "write" })
    setAddUserId("")
  }

  return (
    <Section title="Members">
      <div className="space-y-2">
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        )}
        {members.map((member) => (
          <div
            key={member.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{member.userName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {member.userEmail}
              </div>
            </div>

            <select
              aria-label={`Role for ${member.userName}`}
              value={member.role}
              onChange={(e) =>
                updateMember.mutate({
                  memberId: member.id,
                  role: e.target.value as EventMember["role"],
                })
              }
              className={SELECT_CLASS + " w-36"}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap">
              <Checkbox
                checked={member.canApprove}
                onCheckedChange={(checked) =>
                  updateMember.mutate({
                    memberId: member.id,
                    canApprove: checked === true,
                  })
                }
              />
              Can approve
            </label>

            <button
              type="button"
              aria-label={`Remove ${member.userName}`}
              className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
              disabled={removeMember.isPending}
              onClick={() => removeMember.mutate(member.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <select
          aria-label="Select user to add"
          value={addUserId}
          onChange={(e) => setAddUserId(e.target.value)}
          className={SELECT_CLASS + " flex-1"}
        >
          <option value="">
            {availableUsers.length === 0
              ? "No users available"
              : "Select a user..."}
          </option>
          {availableUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.email})
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={!addUserId || addMember.isPending}
          onClick={handleAdd}
        >
          Add member
        </Button>
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

export default function SettingsPage() {
  const { user } = useAuth()
  const { currentEvent, isLoading } = useEvent()
  const grantMode = currentEvent?.grantMode ?? false

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

          <h1 className="mb-6 text-xl font-bold">Event Settings</h1>

          {isLoading || !currentEvent ? (
            <div className="space-y-6">
              <p className="text-muted-foreground">
                {isLoading
                  ? "Loading..."
                  : "No event selected. Create one below to get started."}
              </p>
              <CreateEventSection />
            </div>
          ) : (
            <div className="space-y-6">
              <EventDetailsSection
                key={currentEvent.id}
                initialName={currentEvent.name}
                initialDescription={currentEvent.description ?? ""}
                initialCurrency={currentEvent.currency || "CAD"}
                initialGrantMode={currentEvent.grantMode}
              />
              <BucketsSection />
              {grantMode && <GrantCategoriesSection />}
              <MembersSection />
              <CreateEventSection />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
