import type { ReactNode } from "react"
import { Link, useNavigate } from "react-router"
import { useAuth } from "../../hooks/use-auth"
import { useEvent } from "../../hooks/use-event"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { ChevronsUpDown, Check, Settings2 } from "lucide-react"

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { events, currentEvent, setCurrentEventId } = useEvent()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="font-semibold transition-colors hover:text-muted-foreground"
          >
            Expense Tracker
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " min-w-[180px] justify-between gap-2"
              }
            >
              <span className="truncate">
                {currentEvent?.name ?? "Select event"}
              </span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              {events.map((ev) => (
                <DropdownMenuItem
                  key={ev.id}
                  onClick={() => setCurrentEventId(ev.id)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">{ev.name}</span>
                  {ev.id === currentEvent?.id && (
                    <Check className="size-3.5 shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigate("/events/manage")}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <Settings2 className="size-3.5 shrink-0" />
                Manage events
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.name}</span>
          {user?.isSuper && (
            <a
              href="/settings"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " leading-none"
              }
            >
              Settings
            </a>
          )}
          {user?.isSuper && (
            <a
              href="/admin"
              className={
                buttonVariants({ variant: "outline", size: "sm" }) +
                " leading-none"
              }
            >
              Admin
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
