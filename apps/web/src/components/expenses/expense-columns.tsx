import { createColumnHelper } from "@tanstack/react-table";
import type { Expense, EventMember, EventBucket } from "../../lib/types";
import { formatCurrency, formatDate } from "../../lib/format";
import { StatusBadge } from "./status-badge";
import { PaidByBadge } from "./paid-by-badge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  ArrowUpDown,
  Paperclip,
} from "lucide-react";

const columnHelper = createColumnHelper<Expense>();

interface ColumnOptions {
  members: EventMember[];
  buckets: EventBucket[];
  grantMode: boolean;
  onCellEdit: (
    expenseId: string,
    field: string,
    value: unknown
  ) => void;
  editingCell: { rowId: string; columnId: string } | null;
  setEditingCell: (cell: { rowId: string; columnId: string } | null) => void;
}

export function getExpenseColumns(options: ColumnOptions) {
  const { members, buckets, grantMode, onCellEdit, editingCell, setEditingCell } =
    options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ReturnType<typeof columnHelper.display>[] = [
    columnHelper.display({
      id: "select",
      size: 40,
      enableResizing: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(checked)
          }
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
          aria-label="Select row"
        />
      ),
    }),

    columnHelper.accessor("date", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Date" />
      ),
      size: 120,
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;
        const value = row.original.date;

        if (isEditing) {
          return (
            <input
              type="date"
              defaultValue={value ?? ""}
              className="bg-background border-input w-full rounded border px-1.5 py-0.5 text-sm outline-none focus:border-ring"
              autoFocus
              onBlur={(e) => {
                onCellEdit(
                  row.original.id,
                  "date",
                  e.target.value || null
                );
                setEditingCell(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onCellEdit(
                    row.original.id,
                    "date",
                    e.currentTarget.value || null
                  );
                  setEditingCell(null);
                }
                if (e.key === "Escape") setEditingCell(null);
              }}
            />
          );
        }

        return (
          <span
            className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-muted"
            onClick={() =>
              setEditingCell({ rowId: row.id, columnId: column.id })
            }
          >
            {formatDate(value) || <span className="text-muted-foreground italic">No date</span>}
          </span>
        );
      },
    }),

    columnHelper.accessor("name", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Name" />
      ),
      size: 220,
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        if (isEditing) {
          return (
            <input
              type="text"
              defaultValue={row.original.name}
              className="bg-background border-input w-full rounded border px-1.5 py-0.5 text-sm outline-none focus:border-ring"
              autoFocus
              onBlur={(e) => {
                if (e.target.value.trim()) {
                  onCellEdit(row.original.id, "name", e.target.value.trim());
                }
                setEditingCell(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  onCellEdit(
                    row.original.id,
                    "name",
                    e.currentTarget.value.trim()
                  );
                  setEditingCell(null);
                }
                if (e.key === "Escape") setEditingCell(null);
              }}
            />
          );
        }

        return (
          <span
            className="cursor-pointer rounded px-1.5 py-0.5 font-medium hover:bg-muted"
            onClick={() =>
              setEditingCell({ rowId: row.id, columnId: column.id })
            }
          >
            {row.original.name}
          </span>
        );
      },
    }),

    columnHelper.accessor("amountCents", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Amount" />
      ),
      size: 130,
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        if (isEditing) {
          return (
            <input
              type="text"
              inputMode="decimal"
              defaultValue={(row.original.amountCents / 100).toFixed(2)}
              className="bg-background border-input w-full rounded border px-1.5 py-0.5 text-right text-sm outline-none focus:border-ring"
              autoFocus
              onBlur={(e) => {
                const num = parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
                if (!isNaN(num)) {
                  onCellEdit(
                    row.original.id,
                    "amountCents",
                    Math.round(num * 100)
                  );
                }
                setEditingCell(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const num = parseFloat(
                    e.currentTarget.value.replace(/[^0-9.]/g, "")
                  );
                  if (!isNaN(num)) {
                    onCellEdit(
                      row.original.id,
                      "amountCents",
                      Math.round(num * 100)
                    );
                  }
                  setEditingCell(null);
                }
                if (e.key === "Escape") setEditingCell(null);
              }}
            />
          );
        }

        return (
          <span
            className="cursor-pointer rounded px-1.5 py-0.5 text-right tabular-nums hover:bg-muted"
            onClick={() =>
              setEditingCell({ rowId: row.id, columnId: column.id })
            }
          >
            {formatCurrency(row.original.amountCents)}
          </span>
        );
      },
    }),

    columnHelper.accessor("status", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Status" />
      ),
      size: 160,
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        if (isEditing) {
          return (
            <select
              defaultValue={row.original.status}
              className="bg-background border-input w-full rounded border px-1.5 py-0.5 text-sm outline-none focus:border-ring"
              autoFocus
              onChange={(e) => {
                onCellEdit(row.original.id, "status", e.target.value);
                setEditingCell(null);
              }}
              onBlur={() => setEditingCell(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingCell(null);
              }}
            >
              <option value="outstanding">Outstanding</option>
              <option value="awaiting_approval">Awaiting Approval</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="reimbursed">Reimbursed</option>
            </select>
          );
        }

        return (
          <span
            className="cursor-pointer"
            onClick={() =>
              setEditingCell({ rowId: row.id, columnId: column.id })
            }
          >
            <StatusBadge status={row.original.status} />
          </span>
        );
      },
    }),

    columnHelper.accessor("paidById", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Paid By" />
      ),
      size: 150,
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        if (isEditing) {
          return (
            <select
              defaultValue={row.original.paidById ?? ""}
              className="bg-background border-input w-full rounded border px-1.5 py-0.5 text-sm outline-none focus:border-ring"
              autoFocus
              onChange={(e) => {
                onCellEdit(
                  row.original.id,
                  "paidById",
                  e.target.value || null
                );
                setEditingCell(null);
              }}
              onBlur={() => setEditingCell(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingCell(null);
              }}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.userName}
                </option>
              ))}
            </select>
          );
        }

        const member = members.find((m) => m.userId === row.original.paidById);

        return (
          <span
            className="cursor-pointer"
            onClick={() =>
              setEditingCell({ rowId: row.id, columnId: column.id })
            }
          >
            {member ? (
              <PaidByBadge name={member.userName} userId={member.userId} />
            ) : (
              <span className="text-muted-foreground italic">Unassigned</span>
            )}
          </span>
        );
      },
    }),

    columnHelper.accessor("bucketId", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Bucket" />
      ),
      size: 140,
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        if (isEditing) {
          return (
            <select
              defaultValue={row.original.bucketId ?? ""}
              className="bg-background border-input w-full rounded border px-1.5 py-0.5 text-sm outline-none focus:border-ring"
              autoFocus
              onChange={(e) => {
                onCellEdit(
                  row.original.id,
                  "bucketId",
                  e.target.value || null
                );
                setEditingCell(null);
              }}
              onBlur={() => setEditingCell(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingCell(null);
              }}
            >
              <option value="">No bucket</option>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          );
        }

        const bucket = buckets.find((b) => b.id === row.original.bucketId);

        return (
          <span
            className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-muted"
            onClick={() =>
              setEditingCell({ rowId: row.id, columnId: column.id })
            }
          >
            {bucket?.name ?? (
              <span className="text-muted-foreground italic">No bucket</span>
            )}
          </span>
        );
      },
    }),

    columnHelper.accessor("notes", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Notes" />
      ),
      size: 180,
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        if (isEditing) {
          return (
            <input
              type="text"
              defaultValue={row.original.notes ?? ""}
              className="bg-background border-input w-full rounded border px-1.5 py-0.5 text-sm outline-none focus:border-ring"
              autoFocus
              onBlur={(e) => {
                onCellEdit(
                  row.original.id,
                  "notes",
                  e.target.value || null
                );
                setEditingCell(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onCellEdit(
                    row.original.id,
                    "notes",
                    e.currentTarget.value || null
                  );
                  setEditingCell(null);
                }
                if (e.key === "Escape") setEditingCell(null);
              }}
            />
          );
        }

        return (
          <span
            className="cursor-pointer truncate rounded px-1.5 py-0.5 hover:bg-muted"
            onClick={() =>
              setEditingCell({ rowId: row.id, columnId: column.id })
            }
            title={row.original.notes ?? undefined}
          >
            {row.original.notes ?? (
              <span className="text-muted-foreground italic">--</span>
            )}
          </span>
        );
      },
    }),

    columnHelper.accessor("receiptCount", {
      header: "Receipts",
      size: 90,
      enableSorting: true,
      cell: ({ row }) => {
        const count = row.original.receiptCount;
        return (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Paperclip className="size-3.5" />
            {count}
          </span>
        );
      },
    }),
  ];

  // Grant Mode columns
  if (grantMode) {
    columns.push(
      columnHelper.accessor("motionNumber", {
        header: ({ column }) => (
          <SortableHeader column={column} label="Motion #" />
        ),
        size: 100,
        cell: ({ row, column }) => {
          const isEditing =
            editingCell?.rowId === row.id &&
            editingCell?.columnId === column.id;

          if (isEditing) {
            return (
              <input
                type="number"
                defaultValue={row.original.motionNumber ?? ""}
                className="bg-background border-input w-full rounded border px-1.5 py-0.5 text-sm outline-none focus:border-ring"
                autoFocus
                onBlur={(e) => {
                  const val = e.target.value
                    ? parseInt(e.target.value, 10)
                    : null;
                  onCellEdit(row.original.id, "motionNumber", val);
                  setEditingCell(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = e.currentTarget.value
                      ? parseInt(e.currentTarget.value, 10)
                      : null;
                    onCellEdit(row.original.id, "motionNumber", val);
                    setEditingCell(null);
                  }
                  if (e.key === "Escape") setEditingCell(null);
                }}
              />
            );
          }

          return (
            <span
              className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-muted"
              onClick={() =>
                setEditingCell({ rowId: row.id, columnId: column.id })
              }
            >
              {row.original.motionNumber ?? (
                <span className="text-muted-foreground italic">--</span>
              )}
            </span>
          );
        },
      })
    );
  }

  return columns;
}

// Sortable header helper
function SortableHeader({
  column,
  label,
}: {
  column: {
    getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
    getIsSorted: () => false | "asc" | "desc";
  };
  label: string;
}) {
  return (
    <button
      className="flex items-center gap-1 font-medium hover:text-foreground"
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      <ArrowUpDown className="size-3.5 text-muted-foreground" />
    </button>
  );
}

// Re-export for use in kanban and elsewhere
export type { ColumnOptions };
