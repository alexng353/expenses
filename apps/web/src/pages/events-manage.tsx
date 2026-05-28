import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { AgGridReact } from "ag-grid-react"
import type {
  ColDef,
  ICellRendererParams,
  ValueGetterParams,
  CellValueChangedEvent,
} from "ag-grid-community"
import { AppShell } from "../components/layout/app-shell"
import { useAuth } from "../hooks/use-auth"
import { useEvent } from "../hooks/use-event"
import { useCreateEvent, useUpdateEvent } from "../hooks/use-event-mutations"
import { agTheme } from "../lib/ag-grid-theme"
import { formatDate } from "../lib/format"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Badge } from "@workspace/ui/components/badge"
import type { Event } from "../lib/types"

function GrantModeRenderer(props: ICellRendererParams<Event>) {
  if (!props.data) return null
  return props.data.grantMode ? (
    <Badge variant="secondary">Yes</Badge>
  ) : (
    <span className="text-muted-foreground">No</span>
  )
}

function CreateEventForm() {
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
    <section className="rounded-lg border bg-background p-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold">Create event</h2>
        <p className="text-sm text-muted-foreground">
          Creates a new event and switches to it.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1.5">
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

        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={grantMode}
            onCheckedChange={(checked) => setGrantMode(checked === true)}
          />
          Grant Mode
        </label>

        <Button onClick={handleCreate} disabled={createEvent.isPending}>
          {createEvent.isPending ? "Creating..." : "Create"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  )
}

export default function EventsManagePage() {
  const { user } = useAuth()
  const { events, setCurrentEventId } = useEvent()
  const updateEvent = useUpdateEvent()
  const navigate = useNavigate()

  const ActionsRenderer = useMemo(() => {
    return function ActionsRendererInner(props: ICellRendererParams<Event>) {
      if (!props.data) return null
      const ev = props.data
      return (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              setCurrentEventId(ev.id)
              navigate("/events")
            }}
          >
            Open
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              setCurrentEventId(ev.id)
              navigate("/settings")
            }}
          >
            Edit
          </Button>
        </div>
      )
    }
  }, [navigate, setCurrentEventId])

  const columnDefs = useMemo<ColDef<Event>[]>(() => {
    return [
      {
        headerName: "Name",
        field: "name",
        flex: 2,
        minWidth: 160,
        editable: true,
      },
      {
        headerName: "Description",
        field: "description",
        flex: 3,
        minWidth: 200,
        editable: true,
        valueGetter: (params: ValueGetterParams<Event>) =>
          params.data?.description ?? "",
      },
      {
        headerName: "Grant Mode",
        field: "grantMode",
        width: 130,
        cellRenderer: GrantModeRenderer,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: [true, false] },
        valueFormatter: (params) => (params.value ? "Yes" : "No"),
      },
      {
        headerName: "Created",
        field: "createdAt",
        width: 130,
        valueFormatter: (params) => formatDate(params.value),
      },
      {
        headerName: "Actions",
        colId: "actions",
        width: 180,
        minWidth: 180,
        suppressSizeToFit: true,
        sortable: false,
        filter: false,
        editable: false,
        cellRenderer: ActionsRenderer,
      },
    ]
  }, [ActionsRenderer])

  const defaultColDef = useMemo<ColDef<Event>>(
    () => ({
      resizable: true,
      sortable: true,
      filter: true,
    }),
    []
  )

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<Event>) => {
      if (!event.data) return
      const field = event.colDef.field
      if (event.oldValue === event.newValue) return
      const id = event.data.id
      if (field === "name") {
        updateEvent.mutate({ id, name: event.data.name })
      } else if (field === "description") {
        updateEvent.mutate({ id, description: event.data.description ?? "" })
      } else if (field === "grantMode") {
        updateEvent.mutate({ id, grantMode: event.data.grantMode })
      }
    },
    [updateEvent]
  )

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
      <div className="flex h-full min-h-0 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-6">
          <h1 className="mb-6 text-xl font-bold">Manage events</h1>

          <div className="mb-6">
            <CreateEventForm />
          </div>

          <p className="mb-2 text-sm text-muted-foreground">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </p>

          {/* Bounded-height container so AG Grid virtualizes rows with
              domLayout="normal" instead of rendering every row. */}
          <div className="min-h-0 flex-1">
            <AgGridReact<Event>
              theme={agTheme}
              rowData={events}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              getRowId={(params) => params.data.id}
              rowHeight={44}
              onCellValueChanged={onCellValueChanged}
              stopEditingWhenCellsLoseFocus={true}
              domLayout="normal"
              animateRows={false}
              noRowsOverlayComponent={() => (
                <div className="py-8 text-muted-foreground">No events yet.</div>
              )}
            />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
