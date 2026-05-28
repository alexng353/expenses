import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { AgGridReact } from "ag-grid-react"
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type CellValueChangedEvent,
  type SelectionChangedEvent,
  type CellContextMenuEvent,
  type ICellRendererParams,
  type GridReadyEvent,
} from "ag-grid-community"
import { useMarqueeSelect } from "../../hooks/use-table-select"
import { Button } from "@workspace/ui/components/button"
import type {
  Expense,
  EventMember,
  EventBucket,
  ExpenseStatus,
} from "../../lib/types"
import { useUpdateExpense, useDeleteExpense } from "../../hooks/use-expenses"
// ExpenseContextMenu not used directly — AG Grid uses a portal-based context menu
import { StatusBadge } from "./status-badge"
import { PaidByBadge } from "./paid-by-badge"
import { formatCurrency, formatDate, statusLabel } from "../../lib/format"
import { Trash2, ArrowRightLeft, X, Paperclip } from "lucide-react"
import type { useUndoStack } from "../../hooks/use-undo"

ModuleRegistry.registerModules([AllCommunityModule])

const agTheme = themeQuartz.withParams({
  backgroundColor: "var(--background)",
  foregroundColor: "var(--foreground)",
  headerBackgroundColor: "var(--background)",
  headerTextColor: "var(--foreground)",
  borderColor: "var(--border)",
  rowHoverColor: "var(--accent)",
  selectedRowBackgroundColor: "hsl(var(--primary) / 0.08)",
  oddRowBackgroundColor: "var(--background)",
  headerFontSize: 13,
  fontSize: 13,
  rowBorder: true,
  columnBorder: false,
  wrapperBorder: false,
  wrapperBorderRadius: "0.5rem",
  spacing: 4,
  cellHorizontalPadding: 12,
})

interface ExpenseTableProps {
  expenses: Expense[]
  members: EventMember[]
  buckets: EventBucket[]
  grantMode: boolean
  onOpenModal: (expense?: Expense) => void
  onOpenReceipts: (expense: Expense) => void
  undoStack: ReturnType<typeof useUndoStack>
  onSelectionChange?: (selectedExpenses: Expense[]) => void
}

// --- Custom cell renderers ---

function StatusCellRenderer(props: ICellRendererParams<Expense>) {
  if (!props.data) return null
  return <StatusBadge status={props.data.status} />
}

function PaidByCellRenderer(
  props: ICellRendererParams<Expense> & { members: EventMember[] }
) {
  if (!props.data) return null
  const member = props.members.find((m) => m.userId === props.data!.paidById)
  if (!member)
    return <span className="text-muted-foreground italic">Unassigned</span>
  return <PaidByBadge name={member.userName} userId={member.userId} />
}

function BucketCellRenderer(
  props: ICellRendererParams<Expense> & { buckets: EventBucket[] }
) {
  if (!props.data) return null
  const bucket = props.buckets.find((b) => b.id === props.data!.bucketId)
  if (!bucket)
    return <span className="text-muted-foreground italic">No bucket</span>
  return <>{bucket.name}</>
}

function ReceiptCellRenderer(props: ICellRendererParams<Expense>) {
  if (!props.data) return null
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <Paperclip className="size-3.5" />
      {props.data.receiptCount}
    </span>
  )
}

function AmountCellRenderer(props: ICellRendererParams<Expense>) {
  if (!props.data) return null
  return (
    <span className="tabular-nums">
      {formatCurrency(props.data.amountCents)}
    </span>
  )
}

function DateCellRenderer(props: ICellRendererParams<Expense>) {
  if (!props.data) return null
  const d = formatDate(props.data.date)
  if (!d) return <span className="text-muted-foreground italic">No date</span>
  return <>{d}</>
}

// --- Main component ---

export function ExpenseTable({
  expenses,
  members,
  buckets,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  grantMode: _grantMode,
  onOpenModal,
  onOpenReceipts,
  undoStack,
  onSelectionChange,
}: ExpenseTableProps) {
  const gridRef = useRef<AgGridReact<Expense>>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [gridApi, setGridApi] = useState<GridApi<Expense> | null>(null)
  const [selectedCount, setSelectedCount] = useState(0)
  const [contextMenuExpense, setContextMenuExpense] = useState<Expense | null>(
    null
  )
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number
    y: number
  } | null>(null)

  const updateExpense = useUpdateExpense()
  const deleteExpense = useDeleteExpense()

  // --- Build stable cell renderer components that close over members/buckets ---
  const PaidByRenderer = useMemo(() => {
    return function PaidByRendererInner(props: ICellRendererParams<Expense>) {
      return <PaidByCellRenderer {...props} members={members} />
    }
  }, [members])

  const BucketRenderer = useMemo(() => {
    return function BucketRendererInner(props: ICellRendererParams<Expense>) {
      return <BucketCellRenderer {...props} buckets={buckets} />
    }
  }, [buckets])

  // Status value labels for select editor
  const statusOptions = useMemo(
    () => [
      "outstanding",
      "awaiting_approval",
      "approved",
      "paid",
      "reimbursed",
    ],
    []
  )

  const paidByOptions = useMemo(
    () => ["", ...members.map((m) => m.userId)],
    [members]
  )

  const bucketOptions = useMemo(
    () => ["", ...buckets.map((b) => b.id)],
    [buckets]
  )

  // --- Column definitions ---
  const columnDefs = useMemo<ColDef<Expense>[]>(() => {
    const paidByValueMap = new Map<string, string>()
    paidByValueMap.set("", "Unassigned")
    for (const m of members) paidByValueMap.set(m.userId, m.userName)

    const bucketValueMap = new Map<string, string>()
    bucketValueMap.set("", "No bucket")
    for (const b of buckets) bucketValueMap.set(b.id, b.name)

    return [
      {
        headerName: "",
        width: 48,
        maxWidth: 48,
        checkboxSelection: true,
        headerCheckboxSelection: true,
        sortable: false,
        filter: false,
        resizable: false,
        editable: false,
        suppressHeaderMenuButton: true,
        valueGetter: () => null,
        cellRenderer: () => null,
      },
      {
        headerName: "Date",
        field: "date",
        width: 120,
        cellRenderer: DateCellRenderer,
        editable: true,
        cellEditor: "agDateStringCellEditor",
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Name",
        field: "name",
        width: 300,
        editable: true,
        cellStyle: { fontWeight: 500 } as Record<string, string | number>,
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Amount",
        field: "amountCents",
        width: 130,
        cellRenderer: AmountCellRenderer,
        editable: true,
        filter: "agNumberColumnFilter",
        valueFormatter: (params) =>
          params.value != null ? (params.value / 100).toFixed(2) : "",
        valueParser: (params) => {
          const num = parseFloat(
            String(params.newValue).replace(/[^0-9.]/g, "")
          )
          return isNaN(num) ? params.oldValue : Math.round(num * 100)
        },
      },
      {
        headerName: "Status",
        field: "status",
        width: 160,
        cellRenderer: StatusCellRenderer,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: {
          values: statusOptions,
        },
        valueFormatter: (params) => statusLabel(params.value ?? ""),
        filter: "agTextColumnFilter",
        filterValueGetter: (params) =>
          statusLabel(params.data?.status ?? ""),
      },
      {
        headerName: "Paid By",
        field: "paidById",
        width: 150,
        cellRenderer: PaidByRenderer,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: {
          values: paidByOptions,
        },
        valueFormatter: (params) =>
          paidByValueMap.get(params.value ?? "") ?? "Unassigned",
        filter: "agTextColumnFilter",
        filterValueGetter: (params) =>
          paidByValueMap.get(params.data?.paidById ?? "") ?? "Unassigned",
      },
      {
        headerName: "Bucket",
        field: "bucketId",
        width: 140,
        cellRenderer: BucketRenderer,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: {
          values: bucketOptions,
        },
        valueFormatter: (params) =>
          bucketValueMap.get(params.value ?? "") ?? "No bucket",
        filter: "agTextColumnFilter",
        filterValueGetter: (params) =>
          bucketValueMap.get(params.data?.bucketId ?? "") ?? "No bucket",
      },
      {
        headerName: "Notes",
        field: "notes",
        width: 350,
        editable: true,
        cellEditor: "agLargeTextCellEditor",
        cellEditorParams: { rows: 4, cols: 50 },
        cellEditorPopup: true,
        cellStyle: { whiteSpace: "pre-wrap", lineHeight: "1.4" } as Record<
          string,
          string | number
        >,
        autoHeight: true,
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Receipts",
        field: "receiptCount",
        width: 90,
        cellRenderer: ReceiptCellRenderer,
        editable: false,
        filter: false,
      },
    ]
  }, [
    members,
    buckets,
    statusOptions,
    paidByOptions,
    bucketOptions,
    PaidByRenderer,
    BucketRenderer,
  ])

  const defaultColDef = useMemo<ColDef<Expense>>(
    () => ({
      resizable: true,
      sortable: true,
      filter: true,
      suppressHeaderMenuButton: false,
    }),
    []
  )

  // --- Event handlers ---

  const COLUMN_STATE_KEY = "expense-table-column-state"

  const onGridReady = useCallback((event: GridReadyEvent<Expense>) => {
    setGridApi(event.api)
    // Restore saved column widths/order from localStorage
    try {
      const saved = localStorage.getItem(COLUMN_STATE_KEY)
      if (saved) {
        const state = JSON.parse(saved)
        event.api.applyColumnState({ state, applyOrder: false })
      }
    } catch {
      // ignore bad data
    }
  }, [])

  const saveColumnState = useCallback(() => {
    if (!gridApi) return
    try {
      const state = gridApi.getColumnState()
      localStorage.setItem(COLUMN_STATE_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [gridApi])

  const expensesRef = useRef(expenses)
  useEffect(() => {
    expensesRef.current = expenses
  }, [expenses])

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<Expense>) => {
      if (!event.data) return
      const field = event.colDef.field as string
      const oldValue = event.oldValue
      let newValue = event.newValue

      // For paidById/bucketId, convert empty string to null
      if ((field === "paidById" || field === "bucketId") && newValue === "") {
        newValue = null
      }

      // Skip if no actual change
      if (oldValue === newValue) return

      // Find the original expense for undo
      const expense = expensesRef.current.find((e) => e.id === event.data!.id)
      if (expense) {
        undoStack.push(expense, field, oldValue, newValue)
      }

      updateExpense.mutate({
        id: event.data.id,
        [field]: newValue,
      } as Parameters<typeof updateExpense.mutate>[0])
    },
    [updateExpense, undoStack]
  )

  const onSelectionChanged = useCallback(
    (event: SelectionChangedEvent<Expense>) => {
      const selected = event.api.getSelectedRows()
      setSelectedCount(selected.length)
      onSelectionChange?.(selected)
    },
    [onSelectionChange]
  )

  // Context menu via AG Grid event
  const onCellContextMenu = useCallback(
    (event: CellContextMenuEvent<Expense>) => {
      if (!event.data) return
      event.event?.preventDefault()
      const mouseEvent = event.event as MouseEvent
      setContextMenuExpense(event.data)
      setContextMenuPos({ x: mouseEvent.clientX, y: mouseEvent.clientY })
    },
    []
  )

  // Close context menu
  useEffect(() => {
    if (!contextMenuPos) return
    const handler = () => {
      setContextMenuExpense(null)
      setContextMenuPos(null)
    }
    document.addEventListener("click", handler)
    document.addEventListener("contextmenu", handler)
    return () => {
      document.removeEventListener("click", handler)
      document.removeEventListener("contextmenu", handler)
    }
  }, [contextMenuPos])

  const onCellEdit = useCallback(
    (expenseId: string, field: string, value: unknown) => {
      const expense = expenses.find((e) => e.id === expenseId)
      if (expense) {
        undoStack.push(
          expense,
          field,
          (expense as unknown as Record<string, unknown>)[field],
          value
        )
      }
      updateExpense.mutate({ id: expenseId, [field]: value } as Parameters<
        typeof updateExpense.mutate
      >[0])
    },
    [updateExpense, expenses, undoStack]
  )

  // --- Bulk actions ---

  const getSelectedIds = useCallback((): string[] => {
    if (!gridApi) return []
    return gridApi.getSelectedRows().map((r) => r.id)
  }, [gridApi])

  const clearSelection = useCallback(() => {
    gridApi?.deselectAll()
  }, [gridApi])

  const handleBulkStatusChange = useCallback(
    (status: string) => {
      const selectedIds = getSelectedIds()
      const batch = selectedIds
        .map((id) => expenses.find((e) => e.id === id))
        .filter(Boolean) as Expense[]
      undoStack.pushBatch(
        batch.map((e) => ({ expense: e, field: "status", oldValue: e.status }))
      )
      for (const id of selectedIds) {
        updateExpense.mutate({ id, status } as Parameters<
          typeof updateExpense.mutate
        >[0])
      }
      clearSelection()
    },
    [getSelectedIds, updateExpense, expenses, undoStack, clearSelection]
  )

  const handleBulkDelete = useCallback(() => {
    const selectedIds = getSelectedIds()
    for (const id of selectedIds) {
      deleteExpense.mutate(id)
    }
    clearSelection()
  }, [getSelectedIds, deleteExpense, clearSelection])

  // Escape to deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedCount > 0) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        clearSelection()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [selectedCount, clearSelection])

  // --- Marquee selection ---
  const onMarqueeSelect = useCallback(
    (ids: string[]) => {
      if (!gridApi) return
      gridApi.deselectAll()
      gridApi.forEachNode((node) => {
        if (node.data && ids.includes(node.data.id)) {
          node.setSelected(true)
        }
      })
    },
    [gridApi]
  )

  const { getContainerProps, marqueeRef, subscribeLive } = useMarqueeSelect({
    containerRef,
    onMarqueeSelect,
  })

  // Stream live marquee selection to parent
  const onSelectionChangeRef = useRef(onSelectionChange)
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  useEffect(() => {
    return subscribeLive((ids) => {
      if (onSelectionChangeRef.current) {
        onSelectionChangeRef.current(
          expensesRef.current.filter((e) => ids.has(e.id))
        )
      }
    })
  }, [subscribeLive])

  // Row total calculation
  const totalCents = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amountCents, 0),
    [expenses]
  )

  return (
    <div className="space-y-2">
      {/* Bulk actions toolbar — always visible */}
      <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm">
        <span className={`font-medium ${selectedCount === 0 ? "text-muted-foreground" : ""}`}>
          {selectedCount} row{selectedCount !== 1 ? "s" : ""} selected
        </span>
        <div className="ml-2 flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="h-7"
            disabled={selectedCount === 0}
            onClick={() => handleBulkStatusChange("paid")}
          >
            <ArrowRightLeft className="mr-1 size-3.5" />
            Mark Paid
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-7"
            disabled={selectedCount === 0}
            onClick={() => handleBulkStatusChange("approved")}
          >
            Mark Approved
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-7"
            disabled={selectedCount === 0}
            onClick={() => handleBulkStatusChange("outstanding")}
          >
            Mark Outstanding
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7"
            disabled={selectedCount === 0}
            onClick={handleBulkDelete}
          >
            <Trash2 className="mr-1 size-3.5" />
            Delete
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7"
          disabled={selectedCount === 0}
          onClick={clearSelection}
        >
          <X className="mr-1 size-3.5" />
          Deselect
        </Button>
      </div>

      <div
        ref={containerRef}
        {...getContainerProps()}
        style={{
          ...getContainerProps().style,
          height: "calc(100vh - 280px)",
          minHeight: 300,
        }}
      >
        <AgGridReact<Expense>
          ref={gridRef}
          theme={agTheme}
          rowData={expenses}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(params) => params.data.id}
          rowSelection="multiple"
          suppressRowClickSelection={false}
          onGridReady={onGridReady}
          onCellValueChanged={onCellValueChanged}
          onSelectionChanged={onSelectionChanged}
          onColumnResized={saveColumnState}
          onColumnMoved={saveColumnState}
          onSortChanged={saveColumnState}
          onCellContextMenu={onCellContextMenu}
          stopEditingWhenCellsLoseFocus={true}
          suppressContextMenu={true}
          animateRows={false}
          noRowsOverlayComponent={() => (
            <div className="py-8 text-muted-foreground">
              No expenses yet. Click "Add Expense" to get started.
            </div>
          )}
        />

        {/* Marquee selection rectangle */}
        <div
          ref={marqueeRef}
          className="pointer-events-none absolute border border-primary/60 bg-primary/10"
          style={{ zIndex: 20, display: "none" }}
        />
      </div>

      {/* Context menu portal */}
      {contextMenuExpense && contextMenuPos && (
        <ContextMenuPortal
          expense={contextMenuExpense}
          members={members}
          position={contextMenuPos}
          onOpenModal={onOpenModal}
          onOpenReceipts={onOpenReceipts}
          onCellEdit={onCellEdit}
          onDelete={() => deleteExpense.mutate(contextMenuExpense.id)}
          onClose={() => {
            setContextMenuExpense(null)
            setContextMenuPos(null)
          }}
        />
      )}

      <div className="flex items-center justify-between px-2 text-sm text-muted-foreground">
        <span>
          {expenses.length} expense{expenses.length !== 1 ? "s" : ""}
        </span>
        <span className="font-medium text-foreground">
          Total: {formatCurrency(totalCents)}
        </span>
      </div>
    </div>
  )
}

// --- Context menu portal (replaces the wrapping approach) ---

function ContextMenuPortal({
  expense,
  members,
  position,
  onOpenModal,
  onOpenReceipts,
  onCellEdit,
  onDelete,
  onClose,
}: {
  expense: Expense
  members: EventMember[]
  position: { x: number; y: number }
  onOpenModal: (expense?: Expense) => void
  onOpenReceipts: (expense: Expense) => void
  onCellEdit: (expenseId: string, field: string, value: unknown) => void
  onDelete: () => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid the opening click from closing immediately
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handler)
    }
  }, [onClose])

  const statuses: { value: ExpenseStatus; label: string }[] = [
    { value: "outstanding", label: "Outstanding" },
    { value: "awaiting_approval", label: "Awaiting Approval" },
    { value: "approved", label: "Approved" },
    { value: "paid", label: "Paid" },
    { value: "reimbursed", label: "Reimbursed" },
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: position.x, top: position.y }}
    >
      <button
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        onClick={() => {
          onOpenModal(expense)
          onClose()
        }}
      >
        Edit
      </button>
      <button
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        onClick={() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const {
            id,
            createdAt,
            updatedAt,
            receiptCount,
            createdById,
            ...rest
          } = expense
          onOpenModal(rest as unknown as Expense)
          onClose()
        }}
      >
        Duplicate
      </button>
      <div className="my-1 h-px bg-border" />
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
        Change Status
      </div>
      {statuses.map((s) => (
        <button
          key={s.value}
          className={`flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${expense.status === s.value ? "font-semibold" : ""}`}
          onClick={() => {
            onCellEdit(expense.id, "status", s.value)
            onClose()
          }}
        >
          {s.label}
          {expense.status === s.value && (
            <span className="ml-auto text-xs text-muted-foreground">
              current
            </span>
          )}
        </button>
      ))}
      <div className="my-1 h-px bg-border" />
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
        Change Paid By
      </div>
      <button
        className={`flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${!expense.paidById ? "font-semibold" : ""}`}
        onClick={() => {
          onCellEdit(expense.id, "paidById", null)
          onClose()
        }}
      >
        Unassigned
      </button>
      {members.map((m) => (
        <button
          key={m.userId}
          className={`flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${expense.paidById === m.userId ? "font-semibold" : ""}`}
          onClick={() => {
            onCellEdit(expense.id, "paidById", m.userId)
            onClose()
          }}
        >
          {m.userName}
          {expense.paidById === m.userId && (
            <span className="ml-auto text-xs text-muted-foreground">
              current
            </span>
          )}
        </button>
      ))}
      <div className="my-1 h-px bg-border" />
      <button
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        onClick={() => {
          onOpenReceipts(expense)
          onClose()
        }}
      >
        View Receipts ({expense.receiptCount})
      </button>
      <div className="my-1 h-px bg-border" />
      <button
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
        onClick={() => {
          onDelete()
          onClose()
        }}
      >
        Delete
      </button>
    </div>
  )
}
