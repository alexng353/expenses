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
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Button } from "@workspace/ui/components/button";
import type { Expense, EventMember, EventBucket } from "../../lib/types";
import { getExpenseColumns } from "./expense-columns";
import { useUpdateExpense, useDeleteExpense } from "../../hooks/use-expenses";
import { ExpenseContextMenu } from "./expense-context-menu";
import { formatCurrency } from "../../lib/format";
import { Trash2, ArrowRightLeft } from "lucide-react";

interface ExpenseTableProps {
  expenses: Expense[];
  members: EventMember[];
  buckets: EventBucket[];
  grantMode: boolean;
  onOpenModal: (expense?: Expense) => void;
  onOpenReceipts: (expense: Expense) => void;
  filterFn?: (expense: Expense) => boolean;
}

export function ExpenseTable({
  expenses,
  members,
  buckets,
  grantMode,
  onOpenModal,
  onOpenReceipts,
  filterFn,
}: ExpenseTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});

  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const parentRef = useRef<HTMLDivElement>(null);

  const onCellEdit = useCallback(
    (expenseId: string, field: string, value: unknown) => {
      updateExpense.mutate({ id: expenseId, [field]: value } as Parameters<typeof updateExpense.mutate>[0]);
    },
    [updateExpense]
  );

  const filteredExpenses = useMemo(() => {
    if (!filterFn) return expenses;
    return expenses.filter(filterFn);
  }, [expenses, filterFn]);

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
    [members, buckets, grantMode, onCellEdit, editingCell, setEditingCell]
  );

  const table = useReactTable({
    data: filteredExpenses,
    columns,
    state: {
      sorting,
      rowSelection,
      columnFilters,
      columnSizing,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  const selectedCount = Object.keys(rowSelection).length;

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
      {/* Bulk actions toolbar */}
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

      {/* Table */}
      <div
        ref={parentRef}
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
                    style={{
                      width: header.getSize(),
                      position: "relative",
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {/* Resize handle */}
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
                  No expenses yet. Click "Add Expense" to get started.
                </TableCell>
              </TableRow>
            ) : (
              rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary footer */}
      <div className="flex items-center justify-between px-2 text-sm text-muted-foreground">
        <span>
          {filteredExpenses.length} expense{filteredExpenses.length !== 1 ? "s" : ""}
          {filterFn && filteredExpenses.length !== expenses.length
            ? ` (${expenses.length} total)`
            : ""}
        </span>
        <span className="font-medium text-foreground">
          Total:{" "}
          {formatCurrency(
            filteredExpenses.reduce((sum, e) => sum + e.amountCents, 0)
          )}
        </span>
      </div>
    </div>
  );
}
