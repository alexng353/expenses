import { useState, useCallback, useMemo, useRef } from "react";
import type { Expense, EventMember, EventBucket, ExpenseStatus } from "../../lib/types";
import { useUpdateExpense } from "../../hooks/use-expenses";
import { formatCurrency, formatDate } from "../../lib/format";
import { StatusBadge } from "./status-badge";
import { PaidByBadge } from "./paid-by-badge";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Paperclip } from "lucide-react";

type GroupBy = "status" | "bucketId" | "paidById";

interface ExpenseKanbanProps {
  expenses: Expense[];
  members: EventMember[];
  buckets: EventBucket[];
  onOpenModal: (expense: Expense) => void;
  onOpenReceipts: (expense: Expense) => void;
}

const STATUS_ORDER: ExpenseStatus[] = [
  "outstanding",
  "awaiting_approval",
  "approved",
  "paid",
  "reimbursed",
];

const STATUS_LABELS: Record<string, string> = {
  outstanding: "Outstanding",
  awaiting_approval: "Awaiting Approval",
  approved: "Approved",
  paid: "Paid",
  reimbursed: "Reimbursed",
};

export function ExpenseKanban({
  expenses,
  members,
  buckets,
  onOpenModal,
  onOpenReceipts,
}: ExpenseKanbanProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const updateExpense = useUpdateExpense();
  const dragExpenseRef = useRef<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; expenses: Expense[] }>();

    if (groupBy === "status") {
      for (const status of STATUS_ORDER) {
        map.set(status, {
          label: STATUS_LABELS[status],
          expenses: [],
        });
      }
    } else if (groupBy === "bucketId") {
      map.set("__none__", { label: "No Bucket", expenses: [] });
      for (const bucket of buckets) {
        map.set(bucket.id, { label: bucket.name, expenses: [] });
      }
    } else {
      map.set("__none__", { label: "Unassigned", expenses: [] });
      for (const member of members) {
        map.set(member.userId, { label: member.userName, expenses: [] });
      }
    }

    for (const expense of expenses) {
      let key: string;
      if (groupBy === "status") {
        key = expense.status;
      } else if (groupBy === "bucketId") {
        key = expense.bucketId ?? "__none__";
      } else {
        key = expense.paidById ?? "__none__";
      }

      const group = map.get(key);
      if (group) {
        group.expenses.push(expense);
      } else {
        // Fallback for unknown keys
        const existing = map.get("__none__");
        if (existing) {
          existing.expenses.push(expense);
        }
      }
    }

    return map;
  }, [expenses, groupBy, buckets, members]);

  const handleDragStart = useCallback((expenseId: string) => {
    dragExpenseRef.current = expenseId;
  }, []);

  const handleDrop = useCallback(
    (targetGroupKey: string) => {
      const expenseId = dragExpenseRef.current;
      if (!expenseId) return;
      dragExpenseRef.current = null;

      const value = targetGroupKey === "__none__" ? null : targetGroupKey;

      if (groupBy === "status") {
        updateExpense.mutate({
          id: expenseId,
          status: value as ExpenseStatus,
        } as Parameters<typeof updateExpense.mutate>[0]);
      } else if (groupBy === "bucketId") {
        updateExpense.mutate({ id: expenseId, bucketId: value } as Parameters<typeof updateExpense.mutate>[0]);
      } else {
        updateExpense.mutate({ id: expenseId, paidById: value } as Parameters<typeof updateExpense.mutate>[0]);
      }
    },
    [groupBy, updateExpense]
  );

  return (
    <div className="space-y-3">
      {/* Group by selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Group by:
        </span>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="border-input bg-background rounded-lg border px-2 py-1 text-sm outline-none focus:border-ring"
        >
          <option value="status">Status</option>
          <option value="bucketId">Bucket</option>
          <option value="paidById">Paid By</option>
        </select>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from(groups.entries()).map(([key, group]) => (
          <div
            key={key}
            className="flex w-72 min-w-72 flex-col rounded-lg border bg-muted/30"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("ring-2", "ring-primary/50");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("ring-2", "ring-primary/50");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("ring-2", "ring-primary/50");
              handleDrop(key);
            }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h3 className="text-sm font-semibold">{group.label}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {group.expenses.length}
              </span>
            </div>

            {/* Cards */}
            <ScrollArea className="max-h-[calc(100vh-360px)] flex-1">
              <div className="space-y-2 p-2">
                {group.expenses.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    No expenses
                  </p>
                ) : (
                  group.expenses.map((expense) => (
                    <KanbanCard
                      key={expense.id}
                      expense={expense}
                      members={members}
                      buckets={buckets}
                      groupBy={groupBy}
                      onDragStart={handleDragStart}
                      onClick={() => onOpenModal(expense)}
                      onReceiptClick={() => onOpenReceipts(expense)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Column total */}
            <div className="border-t px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              {formatCurrency(
                group.expenses.reduce((s, e) => s + e.amountCents, 0)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KanbanCard({
  expense,
  members,
  buckets,
  groupBy,
  onDragStart,
  onClick,
  onReceiptClick,
}: {
  expense: Expense;
  members: EventMember[];
  buckets: EventBucket[];
  groupBy: GroupBy;
  onDragStart: (id: string) => void;
  onClick: () => void;
  onReceiptClick: () => void;
}) {
  const member = members.find((m) => m.userId === expense.paidById);
  const bucket = buckets.find((b) => b.id === expense.bucketId);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(expense.id)}
      onClick={onClick}
      className="cursor-pointer rounded-lg border bg-background p-3 shadow-sm transition-shadow hover:shadow-md active:shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-tight">{expense.name}</h4>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatCurrency(expense.amountCents)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* Show status unless grouped by status */}
        {groupBy !== "status" && (
          <StatusBadge status={expense.status} />
        )}

        {/* Show paid by unless grouped by paidById */}
        {groupBy !== "paidById" && member && (
          <PaidByBadge name={member.userName} userId={member.userId} />
        )}

        {/* Show bucket unless grouped by bucket */}
        {groupBy !== "bucketId" && bucket && (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {bucket.name}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatDate(expense.date) || "No date"}</span>
        {expense.receiptCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReceiptClick();
            }}
            className="flex items-center gap-0.5 hover:text-foreground"
          >
            <Paperclip className="size-3" />
            {expense.receiptCount}
          </button>
        )}
      </div>
    </div>
  );
}
