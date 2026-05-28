import { Link } from "react-router"
import { AppShell } from "../components/layout/app-shell"
import { useAuth } from "../hooks/use-auth"
import { ArrowLeft, Users, CalendarDays, ChevronRight } from "lucide-react"

function HubCard({
  to,
  title,
  description,
  icon,
}: {
  to: string
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-lg border bg-background p-4 transition-colors hover:bg-accent"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
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

          <div className="space-y-3">
            <HubCard
              to="/admin/users"
              title="Users"
              description="Manage platform accounts. Create users and archive or unarchive existing ones."
              icon={<Users className="size-5" />}
            />
            <HubCard
              to="/admin/events"
              title="Events"
              description="Browse all events, create new ones, and switch the active event."
              icon={<CalendarDays className="size-5" />}
            />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
