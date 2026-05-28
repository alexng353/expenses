import type { ReactNode } from "react";
import { useAuth } from "../../hooks/use-auth";
import { useEvent } from "../../hooks/use-event";
import { Button, buttonVariants } from "@workspace/ui/components/button";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { events, currentEvent, setCurrentEventId } = useEvent();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold">Expense Tracker</h1>
          <select
            value={currentEvent?.id ?? ""}
            onChange={(e) => setCurrentEventId(e.target.value)}
            className="border-input bg-background rounded-md border px-2 py-1 text-sm"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">{user?.name}</span>
          {user?.isSuper && (
            <a href="/admin" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Admin
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
