import { Link } from "react-router"
import { useAuth } from "../hooks/use-auth"
import { Receipt, Users, BarChart3, FileText } from "lucide-react"

interface AppCard {
  to?: string
  title: string
  description: string
  icon: React.ReactNode
  disabled?: boolean
}

const apps: AppCard[] = [
  {
    to: "/events",
    title: "Events",
    description: "Track and manage expenses across your events.",
    icon: <Receipt className="size-6" />,
  },
  {
    title: "Members",
    description: "Manage people and roles. Coming soon.",
    icon: <Users className="size-6" />,
    disabled: true,
  },
  {
    title: "Reports",
    description: "Spend analytics and breakdowns. Coming soon.",
    icon: <BarChart3 className="size-6" />,
    disabled: true,
  },
  {
    title: "Documents",
    description: "Receipts and paperwork in one place. Coming soon.",
    icon: <FileText className="size-6" />,
    disabled: true,
  },
]

function ActiveCard({ app }: { app: AppCard }) {
  return (
    <Link
      to={app.to!}
      className="group flex flex-col gap-3 rounded-xl border bg-background p-5 transition-colors hover:bg-accent"
    >
      <div className="flex size-12 items-center justify-center rounded-lg bg-muted text-foreground transition-colors group-hover:bg-background">
        {app.icon}
      </div>
      <div>
        <h2 className="text-base font-semibold">{app.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {app.description}
        </p>
      </div>
    </Link>
  )
}

function DisabledCard({ app }: { app: AppCard }) {
  return (
    <div className="flex cursor-not-allowed flex-col gap-3 rounded-xl border border-dashed bg-muted/30 p-5 opacity-60">
      <div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {app.icon}
      </div>
      <div>
        <h2 className="text-base font-semibold text-muted-foreground">
          {app.title}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {app.description}
        </p>
      </div>
    </div>
  )
}

export default function AppSwitcher() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-3xl">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Expense Tracker</h1>
          {user?.name && (
            <p className="mt-2 text-sm text-muted-foreground">
              Welcome back, {user.name}.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {apps.map((app) =>
            app.disabled ? (
              <DisabledCard key={app.title} app={app} />
            ) : (
              <ActiveCard key={app.title} app={app} />
            )
          )}
        </div>
      </div>
    </div>
  )
}
