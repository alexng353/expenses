import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { AgGridReact, useGridFilter } from "ag-grid-react"
import type { CustomFilterProps } from "ag-grid-react"
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
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@workspace/ui/components/popover"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
  selectedRowBackgroundColor: "color-mix(in oklch, var(--primary) 15%, var(--background))",
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

const STATUS_VALUES: ExpenseStatus[] = [
  "outstanding",
  "awaiting_approval",
  "approved",
  "paid",
  "reimbursed",
]

// --- Click-to-open dropdown cell (status / paid by / bucket) ---

interface DropdownOption {
  value: string
  label: React.ReactNode
}

function DropdownCell({
  display,
  options,
  onSelect,
}: {
  display: React.ReactNode
  options: DropdownOption[]
  onSelect: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-full w-full items-center text-left outline-none"
        // Open on mousedown — fires before AG Grid's click selection so a
        // single click both selects the row and opens the dropdown.
        onMouseDown={() => setOpen(true)}
      >
        {display}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto min-w-[160px] gap-0 p-1"
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            className="flex w-full items-center rounded-md px-2 py-1 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onSelect(opt.value)
              setOpen(false)
            }}
          >
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

// --- Checkbox set filter (AG Grid Community custom filter) ---

function SetFilter(
  props: CustomFilterProps<Expense, unknown, string[]> & {
    options: { value: string; label: string }[]
    getRowValue: (e: Expense) => string
  }
) {
  const { model, onModelChange, options, getRowValue } = props

  const doesFilterPass = useCallback(
    (params: { node: { data?: Expense } }) => {
      if (!model || model.length === 0) return true
      const data = params.node.data
      if (!data) return true
      return model.includes(getRowValue(data))
    },
    [model, getRowValue]
  )

  useGridFilter({ doesFilterPass })

  const selected = model ?? []
  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    onModelChange(next.length > 0 ? next : null)
  }

  return (
    <div className="w-48 p-2">
      <div className="max-h-[min(300px,calc(100vh-200px))] space-y-1 overflow-y-auto pr-1">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent"
          >
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <button
          className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
          onClick={() => onModelChange(null)}
        >
          Clear
        </button>
      )}
    </div>
  )
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

  // Stable ref to expenses for handlers that shouldn't re-create on data change
  const expensesRef = useRef(expenses)
  useEffect(() => {
    expensesRef.current = expenses
  }, [expenses])

  // Direct dropdown edit (status / paid by / bucket) — bypasses AG Grid editing
  const dropdownEdit = useCallback(
    (expenseId: string, field: string, value: string | null) => {
      const expense = expensesRef.current.find((e) => e.id === expenseId)
      if (!expense) return
      const oldValue = (expense as unknown as Record<string, unknown>)[field]
      if (oldValue === value) return
      undoStack.push(expense, field, oldValue, value)
      updateExpense.mutate({
        id: expenseId,
        [field]: value,
      } as Parameters<typeof updateExpense.mutate>[0])
    },
    [updateExpense, undoStack]
  )

  // --- Dropdown cell renderers (click to open Popover) ---
  const StatusRenderer = useMemo(() => {
    return function StatusRendererInner(props: ICellRendererParams<Expense>) {
      if (!props.data) return null
      const id = props.data.id
      return (
        <DropdownCell
          display={<StatusBadge status={props.data.status} />}
          options={STATUS_VALUES.map((s) => ({
            value: s,
            label: <StatusBadge status={s} />,
          }))}
          onSelect={(v) => dropdownEdit(id, "status", v)}
        />
      )
    }
  }, [dropdownEdit])

  const PaidByRenderer = useMemo(() => {
    return function PaidByRendererInner(props: ICellRendererParams<Expense>) {
      if (!props.data) return null
      const id = props.data.id
      const member = members.find((m) => m.userId === props.data!.paidById)
      return (
        <DropdownCell
          display={
            member ? (
              <PaidByBadge name={member.userName} userId={member.userId} />
            ) : (
              <span className="text-muted-foreground italic">Unassigned</span>
            )
          }
          options={[
            {
              value: "",
              label: (
                <span className="text-muted-foreground italic">Unassigned</span>
              ),
            },
            ...members.map((m) => ({
              value: m.userId,
              label: <PaidByBadge name={m.userName} userId={m.userId} />,
            })),
          ]}
          onSelect={(v) => dropdownEdit(id, "paidById", v || null)}
        />
      )
    }
  }, [members, dropdownEdit])

  const BucketRenderer = useMemo(() => {
    return function BucketRendererInner(props: ICellRendererParams<Expense>) {
      if (!props.data) return null
      const id = props.data.id
      const bucket = buckets.find((b) => b.id === props.data!.bucketId)
      return (
        <DropdownCell
          display={
            bucket ? (
              <>{bucket.name}</>
            ) : (
              <span className="text-muted-foreground italic">No bucket</span>
            )
          }
          options={[
            {
              value: "",
              label: (
                <span className="text-muted-foreground italic">No bucket</span>
              ),
            },
            ...buckets.map((b) => ({ value: b.id, label: b.name })),
          ]}
          onSelect={(v) => dropdownEdit(id, "bucketId", v || null)}
        />
      )
    }
  }, [buckets, dropdownEdit])

  // --- Column definitions ---
  const columnDefs = useMemo<ColDef<Expense>[]>(() => {
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
        cellRenderer: StatusRenderer,
        editable: false,
        filter: SetFilter,
        filterParams: {
          options: STATUS_VALUES.map((s) => ({
            value: s,
            label: statusLabel(s),
          })),
          getRowValue: (e: Expense) => e.status,
        },
      },
      {
        headerName: "Paid By",
        field: "paidById",
        width: 150,
        cellRenderer: PaidByRenderer,
        editable: false,
        filter: SetFilter,
        filterParams: {
          options: [
            { value: "", label: "Unassigned" },
            ...members.map((m) => ({ value: m.userId, label: m.userName })),
          ],
          getRowValue: (e: Expense) => e.paidById ?? "",
        },
      },
      {
        headerName: "Bucket",
        field: "bucketId",
        width: 140,
        cellRenderer: BucketRenderer,
        editable: false,
        filter: SetFilter,
        filterParams: {
          options: [
            { value: "", label: "No bucket" },
            ...buckets.map((b) => ({ value: b.id, label: b.name })),
          ],
          getRowValue: (e: Expense) => e.bucketId ?? "",
        },
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
  }, [members, buckets, StatusRenderer, PaidByRenderer, BucketRenderer])

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
            variant="outline"
            size="sm"
            className="h-7"
            disabled={selectedCount === 0}
            onClick={() => handleBulkStatusChange("paid")}
          >
            <ArrowRightLeft className="mr-1 size-3.5" />
            Mark Paid
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={selectedCount === 0}
            onClick={() => handleBulkStatusChange("approved")}
          >
            Mark Approved
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={selectedCount === 0}
            onClick={() => handleBulkStatusChange("outstanding")}
          >
            Mark Outstanding
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 border-destructive/40 text-destructive hover:bg-destructive/20 hover:text-destructive"
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
          maxHeight: "calc(100vh - 280px)",
          overflow: "auto",
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
          domLayout="autoHeight"
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
