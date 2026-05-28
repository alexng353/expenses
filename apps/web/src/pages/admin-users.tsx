import { useCallback, useMemo, useState } from "react"
import { AgGridReact } from "ag-grid-react"
import type {
  ColDef,
  ICellRendererParams,
  CellValueChangedEvent,
} from "ag-grid-community"
import { AdminShell } from "../components/layout/admin-shell"
import {
  useAllUsers,
  useCreateUser,
  useUpdateUser,
  useArchiveUser,
  useUnarchiveUser,
  type AdminUser,
} from "../hooks/use-event-mutations"
import { agTheme } from "../lib/ag-grid-theme"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Badge } from "@workspace/ui/components/badge"

function SuperRenderer(props: ICellRendererParams<AdminUser>) {
  if (!props.data) return null
  return props.data.isSuper ? (
    <Badge variant="secondary">Yes</Badge>
  ) : (
    <span className="text-muted-foreground">No</span>
  )
}

function ArchivedRenderer(props: ICellRendererParams<AdminUser>) {
  if (!props.data) return null
  return props.data.archived ? (
    <Badge variant="outline">Archived</Badge>
  ) : (
    <Badge variant="ghost">Active</Badge>
  )
}

function CreateUserForm() {
  const createUser = useCreateUser()
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
    <section className="rounded-lg border bg-background p-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold">Create user</h2>
        <p className="text-sm text-muted-foreground">
          Creating a user sends them a setup email.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1 space-y-1.5">
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

        <div className="min-w-[200px] flex-1 space-y-1.5">
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

        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={isSuper}
            onCheckedChange={(checked) => setIsSuper(checked === true)}
          />
          Platform super admin
        </label>

        <Button onClick={handleCreate} disabled={createUser.isPending}>
          {createUser.isPending ? "Creating..." : "Create user"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  )
}

export default function AdminUsersPage() {
  const { data: users = [], isLoading } = useAllUsers()
  const updateUser = useUpdateUser()
  const archiveUser = useArchiveUser()
  const unarchiveUser = useUnarchiveUser()

  const ActionsRenderer = useMemo(() => {
    return function ActionsRendererInner(
      props: ICellRendererParams<AdminUser>
    ) {
      if (!props.data) return null
      const u = props.data
      return u.archived ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
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
          className="h-7"
          disabled={archiveUser.isPending}
          onClick={() => archiveUser.mutate(u.id)}
        >
          Archive
        </Button>
      )
    }
  }, [archiveUser, unarchiveUser])

  const columnDefs = useMemo<ColDef<AdminUser>[]>(() => {
    return [
      {
        headerName: "Name",
        field: "name",
        flex: 2,
        minWidth: 160,
        editable: true,
      },
      { headerName: "Email", field: "email", flex: 2, minWidth: 200 },
      {
        headerName: "Super",
        field: "isSuper",
        width: 110,
        cellRenderer: SuperRenderer,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: [true, false] },
        valueFormatter: (params) => (params.value ? "Yes" : "No"),
      },
      {
        headerName: "Archived",
        field: "archived",
        width: 120,
        cellRenderer: ArchivedRenderer,
      },
      {
        headerName: "Actions",
        colId: "actions",
        width: 140,
        suppressSizeToFit: true,
        sortable: false,
        filter: false,
        editable: false,
        cellRenderer: ActionsRenderer,
      },
    ]
  }, [ActionsRenderer])

  const defaultColDef = useMemo<ColDef<AdminUser>>(
    () => ({
      resizable: true,
      sortable: true,
      filter: true,
    }),
    []
  )

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<AdminUser>) => {
      if (!event.data) return
      const field = event.colDef.field
      if (event.oldValue === event.newValue) return
      if (field === "name") {
        updateUser.mutate({ id: event.data.id, name: event.data.name })
      } else if (field === "isSuper") {
        updateUser.mutate({ id: event.data.id, isSuper: event.data.isSuper })
      }
    },
    [updateUser]
  )

  return (
    <AdminShell>
      <div className="flex h-full min-h-0 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-6">
          <h1 className="mb-6 text-xl font-bold">Users</h1>

          <div className="mb-6">
            <CreateUserForm />
          </div>

          <p className="mb-2 text-sm text-muted-foreground">
            {isLoading
              ? "Loading users..."
              : `${users.length} user${users.length !== 1 ? "s" : ""}`}
          </p>

          {/* Bounded-height container so AG Grid virtualizes rows with
              domLayout="normal" instead of rendering every row. */}
          <div className="min-h-0 flex-1">
            <AgGridReact<AdminUser>
              theme={agTheme}
              rowData={users}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              getRowId={(params) => params.data.id}
              onCellValueChanged={onCellValueChanged}
              stopEditingWhenCellsLoseFocus={true}
              domLayout="normal"
              animateRows={false}
              noRowsOverlayComponent={() => (
                <div className="py-8 text-muted-foreground">No users yet.</div>
              )}
            />
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
