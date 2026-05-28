import type { ReactNode } from "react"
import { useAuth } from "../../hooks/use-auth"
import { useEvent } from "../../hooks/use-event"
import { Button, buttonVariants } from "@workspace/ui/components/button"

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { events, currentEvent, setCurrentEventId } = useEvent()

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold">Expense Tracker</h1>
          <select
            value={currentEvent?.id ?? ""}
            onChange={(e) => setCurrentEventId(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.name}</span>
          {user?.isSuper && (
            <a
              href="/settings"
              className={buttonVariants({ variant: "outline", size: "sm" }) + " leading-none"}
            >
              Settings
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
