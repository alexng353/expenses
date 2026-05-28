import type { ReactNode } from "react"
import { Link, NavLink } from "react-router"
import { useAuth } from "../../hooks/use-auth"
import { ArrowLeft, Users } from "lucide-react"

const navItems = [{ to: "/admin/users", label: "Users", icon: Users }]

export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  if (!user?.isSuper) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">
          You are not authorized to view this page.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-background">
        <div className="border-b px-4 py-4">
          <h1 className="text-lg font-bold">Admin</h1>
          <Link
            to="/"
            className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to app
          </Link>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
                }
              >
                <Icon className="size-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
      </aside>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
