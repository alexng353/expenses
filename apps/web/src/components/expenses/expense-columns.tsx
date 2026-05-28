import { createColumnHelper } from "@tanstack/react-table";
import type { Expense, EventMember, EventBucket } from "../../lib/types";
import { formatCurrency, formatDate } from "../../lib/format";
import { StatusBadge } from "./status-badge";
import { PaidByBadge } from "./paid-by-badge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@workspace/ui/components/popover";
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
  /** External selection state from useTableSelect */
  selected?: Set<string>;
  /** Select/deselect all visible rows */
  onSelectAll?: () => void;
  /** Clear all selection */
  onClearSelection?: () => void;
  /** Handle checkbox click with shift support */
  onCheckboxClick?: (rowId: string, shiftKey: boolean) => void;
}

export function getExpenseColumns(options: ColumnOptions) {
  const {
    members, buckets, grantMode, onCellEdit, editingCell, setEditingCell,
    selected, onSelectAll, onClearSelection, onCheckboxClick,
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ReturnType<typeof columnHelper.display>[] = [
    columnHelper.display({
      id: "select",
      size: 40,
      enableResizing: false,
      header: ({ table }) => {
        const allRowIds = table.getRowModel().rows.map((r) => r.id);
        const allSelected = selected ? allRowIds.length > 0 && allRowIds.every((id) => selected.has(id)) : false;
        const someSelected = selected ? !allSelected && allRowIds.some((id) => selected.has(id)) : false;

        return (
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onCheckedChange={(checked) => {
              if (checked) {
                onSelectAll?.();
              } else {
                onClearSelection?.();
              }
            }}
            aria-label="Select all"
          />
        );
      },
      cell: ({ row }) => {
        const isSelected = selected ? selected.has(row.id) : false;
        return (
          <Checkbox
            checked={isSelected}
            onCheckedChange={(_checked, eventDetails) => {
              const nativeEvent = eventDetails.event;
              const shiftKey = nativeEvent instanceof MouseEvent ? nativeEvent.shiftKey : false;
              onCheckboxClick?.(row.id, shiftKey);
            }}
            aria-label="Select row"
          />
        );
      },
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
              className="bg-transparent w-full text-sm outline-none ring-1 ring-ring rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 box-content"
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
      enableColumnFilter: true,
      filterFn: "includesString",
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        if (isEditing) {
          return (
            <input
              type="text"
              defaultValue={row.original.name}
              className="bg-transparent w-full text-sm outline-none ring-1 ring-ring rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 box-content"
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
      enableColumnFilter: true,
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.original.status);
      },
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        return (
          <Popover>
            <PopoverTrigger
              className="cursor-pointer outline-none"
              onClick={() => console.log("STATUS TRIGGER CLICKED", row.original.id)}
            >
              <StatusBadge status={row.original.status} />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto min-w-[160px] p-1 gap-0">
              {(["outstanding", "awaiting_approval", "approved", "paid", "reimbursed"] as const).map((s) => (
                <button
                  key={s}
                  className="flex w-full items-center rounded-md px-2 py-1 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    console.log("STATUS ITEM CLICKED", s);
                    onCellEdit(row.original.id, "status", s);
                  }}
                >
                  <StatusBadge status={s} />
                </button>
              ))}
            </PopoverContent>
          </Popover>
        );
      },
    }),

    columnHelper.accessor("paidById", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Paid By" />
      ),
      size: 150,
      enableColumnFilter: true,
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.original.paidById ?? "");
      },
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        const member = members.find((m) => m.userId === row.original.paidById);

        return (
          <Popover>
            <PopoverTrigger className="cursor-pointer outline-none">
              {member ? (
                <PaidByBadge name={member.userName} userId={member.userId} />
              ) : (
                <span className="text-muted-foreground italic">Unassigned</span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto min-w-[160px] p-1 gap-0">
              <button
                className="flex w-full items-center rounded-md px-2 py-1 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                onClick={() => onCellEdit(row.original.id, "paidById", null)}
              >
                <span className="text-muted-foreground italic">Unassigned</span>
              </button>
              {members.map((m) => (
                <button
                  key={m.userId}
                  className="flex w-full items-center rounded-md px-2 py-1 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => onCellEdit(row.original.id, "paidById", m.userId)}
                >
                  <PaidByBadge name={m.userName} userId={m.userId} />
                </button>
              ))}
            </PopoverContent>
          </Popover>
        );
      },
    }),

    columnHelper.accessor("bucketId", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Bucket" />
      ),
      size: 140,
      enableColumnFilter: true,
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.original.bucketId ?? "");
      },
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        const bucket = buckets.find((b) => b.id === row.original.bucketId);

        return (
          <Popover>
            <PopoverTrigger className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-muted outline-none">
              {bucket?.name ?? (
                <span className="text-muted-foreground italic">No bucket</span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto min-w-[140px] p-1 gap-0">
              <button
                className="flex w-full items-center rounded-md px-2 py-1 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                onClick={() => onCellEdit(row.original.id, "bucketId", null)}
              >
                <span className="text-muted-foreground italic">No bucket</span>
              </button>
              {buckets.map((b) => (
                <button
                  key={b.id}
                  className="flex w-full items-center rounded-md px-2 py-1 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => onCellEdit(row.original.id, "bucketId", b.id)}
                >
                  {b.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        );
      },
    }),

    columnHelper.accessor("notes", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Notes" />
      ),
      size: 250,
      maxSize: 350,
      enableColumnFilter: true,
      filterFn: "includesString",
      cell: ({ row, column }) => {
        const isEditing =
          editingCell?.rowId === row.id &&
          editingCell?.columnId === column.id;

        if (isEditing) {
          return (
            <textarea
              defaultValue={row.original.notes ?? ""}
              className="bg-transparent w-full text-sm outline-none ring-1 ring-ring rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 box-content resize-none"
              rows={2}
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
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
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
            className="block cursor-pointer whitespace-pre-wrap break-words rounded px-1.5 py-0.5 text-sm leading-snug hover:bg-muted"
            style={{ maxWidth: 350 }}
            onClick={() =>
              setEditingCell({ rowId: row.id, columnId: column.id })
            }
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
      enableColumnFilter: true,
      filterFn: (row, _columnId, filterValue: string[]) => {
        if (!filterValue || filterValue.length === 0) return true;
        const has = row.original.receiptCount > 0;
        if (filterValue.includes("has") && has) return true;
        if (filterValue.includes("missing") && !has) return true;
        return false;
      },
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
