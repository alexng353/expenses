import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { useTableSelect } from "../../hooks/use-table-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Button } from "@workspace/ui/components/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@workspace/ui/components/popover";
import { Input } from "@workspace/ui/components/input";
import { Checkbox } from "@workspace/ui/components/checkbox";
import type { Expense, EventMember, EventBucket } from "../../lib/types";
import { getExpenseColumns } from "./expense-columns";
import { useUpdateExpense, useDeleteExpense } from "../../hooks/use-expenses";
import { ExpenseContextMenu } from "./expense-context-menu";
import { formatCurrency } from "../../lib/format";
import { Trash2, ArrowRightLeft, Filter, X } from "lucide-react";
import type { useUndoStack } from "../../hooks/use-undo";

interface ExpenseTableProps {
  expenses: Expense[];
  members: EventMember[];
  buckets: EventBucket[];
  grantMode: boolean;
  onOpenModal: (expense?: Expense) => void;
  onOpenReceipts: (expense: Expense) => void;
  undoStack: ReturnType<typeof useUndoStack>;
  /** Callback — fires on committed selection AND during marquee drag (via rAF) */
  onSelectionChange?: (selectedExpenses: Expense[]) => void;
}

export function ExpenseTable({
  expenses,
  members,
  buckets,
  grantMode,
  onOpenModal,
  onOpenReceipts,
  undoStack,
  onSelectionChange,
}: ExpenseTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const onCellEdit = useCallback(
    (expenseId: string, field: string, value: unknown) => {
      const expense = expenses.find((e) => e.id === expenseId);
      if (expense) {
        undoStack.push(expense, field, (expense as any)[field], value);
      }
      updateExpense.mutate({ id: expenseId, [field]: value } as Parameters<typeof updateExpense.mutate>[0]);
    },
    [updateExpense, expenses, undoStack]
  );

  // We build the table first (without selection), then derive rowIds from it
  // for the selection hook. We use a two-pass approach: memoize columns without
  // selection first, build the table, get row IDs, then pass selection into columns.

  const table = useReactTable({
    data: expenses,
    columns: useMemo(
      () =>
        getExpenseColumns({
          members,
          buckets,
          grantMode,
          onCellEdit,
          editingCell,
          setEditingCell,
        }),
      [members, buckets, grantMode, onCellEdit, editingCell, setEditingCell]
    ),
    state: {
      sorting,
      columnSizing,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  const { rows } = table.getRowModel();
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // --- Custom selection hook ---
  const {
    selected,
    selectAll,
    clearSelection,
    handleCheckboxClick,
    getContainerProps,
    getRowProps,
    marqueeActive,
    marqueeRef,
    subscribeLive,
  } = useTableSelect(rowIds);

  // Stream live marquee selection to parent (updates summary, not table)
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);
  const expensesRef = useRef(expenses);
  useEffect(() => { expensesRef.current = expenses; }, [expenses]);

  useEffect(() => {
    return subscribeLive((ids) => {
      if (onSelectionChangeRef.current) {
        onSelectionChangeRef.current(
          expensesRef.current.filter((e) => ids.has(e.id))
        );
      }
    });
  }, [subscribeLive]);

  // Ref to selected — columns read this without memo invalidation
  const selectedStateRef = useRef(selected);
  useEffect(() => { selectedStateRef.current = selected; }, [selected]);

  const [liveCount, setLiveCount] = useState(0);
  useEffect(() => {
    return subscribeLive((ids) => setLiveCount(ids.size));
  }, [subscribeLive]);

  const selectedCount = marqueeActive ? liveCount : selected.size;
  const activeFilterCount = columnFilters.length;

  // Columns with selection — selectedRef is stable, so this memo only
  // invalidates on structural changes (members, buckets, editingCell), never on selection
  const columnsWithSelection = useMemo(
    () =>
      getExpenseColumns({
        members,
        buckets,
        grantMode,
        onCellEdit,
        editingCell,
        setEditingCell,
        selectedRef: selectedStateRef,
        onSelectAll: selectAll,
        onClearSelection: clearSelection,
        onCheckboxClick: handleCheckboxClick,
      }),
    [members, buckets, grantMode, onCellEdit, editingCell, setEditingCell, selectAll, clearSelection, handleCheckboxClick]
  );

  // Update table columns to include selection callbacks
  table.setOptions((prev) => ({ ...prev, columns: columnsWithSelection }));

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      const selectedExpenses = expenses.filter((e) => selected.has(e.id));
      onSelectionChange(selectedExpenses);
    }
  }, [selected, expenses, onSelectionChange]);

  // Escape to deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedCount > 0) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        clearSelection();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedCount, clearSelection]);

  // Bulk edits: when user changes status/paidBy via popover on a selected row, apply to all selected
  const handleBulkStatusChange = useCallback(
    (status: string) => {
      const selectedIds = Array.from(selected);
      const batch = selectedIds
        .map((id) => expenses.find((e) => e.id === id))
        .filter(Boolean) as Expense[];
      undoStack.pushBatch(
        batch.map((e) => ({ expense: e, field: "status", oldValue: e.status }))
      );
      for (const id of selectedIds) {
        updateExpense.mutate({ id, status } as Parameters<typeof updateExpense.mutate>[0]);
      }
      clearSelection();
    },
    [selected, updateExpense, expenses, undoStack, clearSelection]
  );

  const handleBulkDelete = useCallback(() => {
    const selectedIds = Array.from(selected);
    for (const id of selectedIds) {
      deleteExpense.mutate(id);
    }
    clearSelection();
  }, [selected, deleteExpense, clearSelection]);

  return (
    <div className="space-y-2">
      {/* Clear filters bar */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm">
          <Filter className="size-3.5 text-primary" />
          <span>
            {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active
            {rows.length !== expenses.length && (
              <> &middot; showing {rows.length} of {expenses.length}</>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={() => setColumnFilters([])}
          >
            <X className="mr-1 size-3.5" />
            Clear all filters
          </Button>
        </div>
      )}

      {/* Bulk actions toolbar */}
      {selectedCount > 0 && (
        <div className="bg-muted flex items-center gap-2 rounded-lg px-4 py-2 text-sm">
          <span className="font-medium">
            {selectedCount} row{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <div className="ml-2 flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              className="h-7"
              onClick={() => handleBulkStatusChange("paid")}
            >
              <ArrowRightLeft className="mr-1 size-3.5" />
              Mark Paid
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-7"
              onClick={() => handleBulkStatusChange("approved")}
            >
              Mark Approved
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-7"
              onClick={() => handleBulkStatusChange("outstanding")}
            >
              Mark Outstanding
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7"
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
            onClick={clearSelection}
          >
            <X className="mr-1 size-3.5" />
            Deselect
          </Button>
        </div>
      )}

      <div
        className="overflow-auto rounded-lg border"
        {...getContainerProps()}
        style={{
          ...getContainerProps().style,
          maxHeight: "calc(100vh - 280px)",
        }}
      >
        <Table style={{ tableLayout: "fixed", width: Math.max(table.getTotalSize(), 100) + "px", minWidth: "100%" }}>
          <TableHeader className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="group/header"
                    style={{
                      width: header.getSize(),
                      position: "relative",
                    }}
                  >
                    <div className="flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      {header.column.getCanFilter() && (
                        <ColumnFilter
                          column={header.column}
                          expenses={expenses}
                          members={members}
                          buckets={buckets}
                        />
                      )}
                    </div>
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/50 ${
                          header.column.getIsResizing()
                            ? "bg-primary"
                            : ""
                        }`}
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnsWithSelection.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {activeFilterCount > 0
                    ? "No expenses match the current filters."
                    : "No expenses yet. Click \"Add Expense\" to get started."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const rowProps = getRowProps(row.id);
                return (
                  <ExpenseContextMenu
                    key={row.id}
                    expense={row.original}
                    members={members}
                    onEdit={() => onOpenModal(row.original)}
                    onDuplicate={() => {
                      const { id: _id, createdAt: _ca, updatedAt: _ua, receiptCount: _rc, createdById: _cb, ...rest } = row.original;
                      onOpenModal(rest as unknown as Expense);
                    }}
                    onStatusChange={(status) =>
                      onCellEdit(row.original.id, "status", status)
                    }
                    onPaidByChange={(paidById) =>
                      onCellEdit(row.original.id, "paidById", paidById)
                    }
                    onViewReceipts={() => onOpenReceipts(row.original)}
                    onDelete={() => deleteExpense.mutate(row.original.id)}
                  >
                    <TableRow
                      ref={rowProps.ref}
                      onMouseDown={rowProps.onMouseDown}
                      data-state={
                        selected.has(row.id) ? "selected" : undefined
                      }
                      className="group"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </ExpenseContextMenu>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Marquee selection rectangle — positioned via ref, not state */}
        <div
          ref={marqueeRef}
          className="pointer-events-none absolute border border-primary/60 bg-primary/10"
          style={{ zIndex: 20, display: "none" }}
        />
      </div>

      <div className="flex items-center justify-between px-2 text-sm text-muted-foreground">
        <span>
          {rows.length} expense{rows.length !== 1 ? "s" : ""}
          {activeFilterCount > 0 && rows.length !== expenses.length
            ? ` of ${expenses.length}`
            : ""}
        </span>
        <span className="font-medium text-foreground">
          Total:{" "}
          {formatCurrency(
            rows.reduce((sum, r) => sum + r.original.amountCents, 0)
          )}
        </span>
      </div>
    </div>
  );
}

// Per-column filter popover
function ColumnFilter({
  column,
  expenses,
  members,
  buckets,
}: {
  column: any;
  expenses: Expense[];
  members: EventMember[];
  buckets: EventBucket[];
}) {
  const columnId = column.id;
  const filterValue = column.getFilterValue();
  const isActive = filterValue != null && (typeof filterValue === "string" ? filterValue.length > 0 : Array.isArray(filterValue) && filterValue.length > 0);

  if (columnId === "name" || columnId === "notes" || columnId === "date") {
    return (
      <Popover>
        <PopoverTrigger className="outline-none">
          <Filter className={`size-3 ${isActive ? "text-primary" : "text-muted-foreground opacity-0 group-hover/header:opacity-100"} hover:text-foreground transition-opacity`} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2 gap-1">
          <Input
            placeholder={`Filter ${columnId}...`}
            value={(filterValue as string) ?? ""}
            onChange={(e) => column.setFilterValue(e.target.value || undefined)}
            className="h-8 text-sm"
            autoFocus
          />
          {isActive && (
            <button
              className="text-xs text-muted-foreground underline hover:text-foreground mt-1"
              onClick={() => column.setFilterValue(undefined)}
            >
              Clear
            </button>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  let options: { value: string; label: string }[] = [];

  if (columnId === "status") {
    options = [
      { value: "outstanding", label: "Outstanding" },
      { value: "awaiting_approval", label: "Awaiting Approval" },
      { value: "approved", label: "Approved" },
      { value: "paid", label: "Paid" },
      { value: "reimbursed", label: "Reimbursed" },
    ];
  } else if (columnId === "paidById") {
    options = [
      { value: "", label: "Unassigned" },
      ...members.map((m) => ({ value: m.userId, label: m.userName })),
    ];
  } else if (columnId === "bucketId") {
    options = [
      { value: "", label: "No bucket" },
      ...buckets.map((b) => ({ value: b.id, label: b.name })),
    ];
  } else if (columnId === "receiptCount") {
    options = [
      { value: "has", label: "Has receipts" },
      { value: "missing", label: "Missing receipts" },
    ];
  } else {
    return null;
  }

  const selected: string[] = (filterValue as string[]) ?? [];
  const toggle = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    column.setFilterValue(next.length > 0 ? next : undefined);
  };

  return (
    <Popover>
      <PopoverTrigger className="outline-none">
        <Filter className={`size-3 ${isActive ? "text-primary" : "text-muted-foreground opacity-0 group-hover/header:opacity-100"} hover:text-foreground transition-opacity`} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-2 pr-0 gap-0">
        <div className="space-y-1 max-h-[min(300px,calc(100vh-200px))] overflow-y-auto pr-2">
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
        {isActive && (
          <button
            className="text-xs text-muted-foreground underline hover:text-foreground mt-2"
            onClick={() => column.setFilterValue(undefined)}
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
