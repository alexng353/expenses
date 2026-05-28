import { useState, useCallback, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type RowSelectionState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
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
import { formatCurrency, statusLabel } from "../../lib/format";
import { Trash2, ArrowRightLeft, Filter } from "lucide-react";
import type { useUndoStack } from "../../hooks/use-undo";

interface ExpenseTableProps {
  expenses: Expense[];
  members: EventMember[];
  buckets: EventBucket[];
  grantMode: boolean;
  onOpenModal: (expense?: Expense) => void;
  onOpenReceipts: (expense: Expense) => void;
  undoStack: ReturnType<typeof useUndoStack>;
}

export function ExpenseTable({
  expenses,
  members,
  buckets,
  grantMode,
  onOpenModal,
  onOpenReceipts,
  undoStack,
}: ExpenseTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  // Stable row order: snapshot the sort order on initial load / filter change only
  const sortKeyRef = useRef<string>("");
  const stableExpenses = useMemo(() => {
    // Re-sort only when the column filters or sorting state changes, not on data updates
    const key = JSON.stringify({ sorting, columnFilters });
    if (key !== sortKeyRef.current) {
      sortKeyRef.current = key;
    }
    return expenses;
  }, [expenses, sorting, columnFilters]);

  const onCellEdit = useCallback(
    (expenseId: string, field: string, value: unknown) => {
      const expense = expenses.find((e) => e.id === expenseId);
      if (expense) {
        undoStack.push(expense, field, (expense as any)[field]);
      }
      updateExpense.mutate({ id: expenseId, [field]: value } as Parameters<typeof updateExpense.mutate>[0]);
    },
    [updateExpense, expenses, undoStack]
  );

  const columns = useMemo(
    () =>
      getExpenseColumns({
        members,
        buckets,
        grantMode,
        onCellEdit,
        editingCell,
        setEditingCell,
      }),
    [members, buckets, grantMode, onCellEdit, editingCell]
  );

  const table = useReactTable({
    data: stableExpenses,
    columns,
    state: {
      sorting,
      rowSelection,
      columnSizing,
      columnFilters,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: setColumnSizing,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    filterFns: {
      arrIncludesSome: (row, columnId, filterValue: string[]) => {
        const val = row.getValue(columnId);
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(String(val ?? ""));
      },
    },
  });

  const { rows } = table.getRowModel();
  const selectedCount = Object.keys(rowSelection).length;
  const activeFilterCount = columnFilters.length;

  const handleBulkStatusChange = useCallback(
    (status: string) => {
      const selectedIds = Object.keys(rowSelection);
      for (const id of selectedIds) {
        updateExpense.mutate({ id, status } as Parameters<typeof updateExpense.mutate>[0]);
      }
      setRowSelection({});
    },
    [rowSelection, updateExpense]
  );

  const handleBulkDelete = useCallback(() => {
    const selectedIds = Object.keys(rowSelection);
    for (const id of selectedIds) {
      deleteExpense.mutate(id);
    }
    setRowSelection({});
  }, [rowSelection, deleteExpense]);

  return (
    <div className="space-y-2">
      {selectedCount > 0 && (
        <div className="bg-muted flex items-center gap-3 rounded-lg px-4 py-2 text-sm">
          <span className="font-medium">
            {selectedCount} row{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBulkStatusChange("paid")}
            >
              <ArrowRightLeft className="mr-1 size-3.5" />
              Mark Paid
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBulkStatusChange("approved")}
            >
              Mark Approved
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleBulkDelete}
            >
              <Trash2 className="mr-1 size-3.5" />
              Delete
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setRowSelection({})}
          >
            Clear
          </Button>
        </div>
      )}

      <div
        className="overflow-auto rounded-lg border"
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        <Table>
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
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {activeFilterCount > 0
                    ? "No expenses match the current filters."
                    : "No expenses yet. Click \"Add Expense\" to get started."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
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
                    data-state={
                      row.getIsSelected() ? "selected" : undefined
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-2 text-sm text-muted-foreground">
        <span>
          {rows.length} expense{rows.length !== 1 ? "s" : ""}
          {activeFilterCount > 0 && rows.length !== expenses.length
            ? ` (${expenses.length} total)`
            : ""}
          {activeFilterCount > 0 && (
            <button
              className="ml-2 text-xs underline hover:text-foreground"
              onClick={() => setColumnFilters([])}
            >
              Clear filters
            </button>
          )}
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

  // Text-searchable columns
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

  // Enum/set columns — show checkboxes
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
    // Special: filter by has/missing receipts
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
      <PopoverContent align="start" className="w-48 p-2 gap-0">
        <div className="space-y-1 max-h-48 overflow-y-auto">
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
