import { useState, useCallback, useMemo } from "react";
import { AppShell } from "../components/layout/app-shell";
import { ExpenseTable } from "../components/expenses/expense-table";
import { ExpenseKanban } from "../components/expenses/expense-kanban";
import { ExpenseModal } from "../components/expenses/expense-modal";
import {
  ExpenseFilters,
  buildFilterFn,
  DEFAULT_FILTERS,
  type FilterState,
} from "../components/expenses/expense-filters";
import { SummaryPanel } from "../components/summary/summary-panel";
import { ReceiptDialog } from "../components/expenses/receipt-dialog";
import { useEvent } from "../hooks/use-event";
import { useExpenses } from "../hooks/use-expenses";
import { Button } from "@workspace/ui/components/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs";
import type { Expense } from "../lib/types";
import { Plus, Table2, LayoutGrid } from "lucide-react";

export default function DashboardPage() {
  const { currentEvent, members, buckets, grantCategories, isLoading } =
    useEvent();
  const { data: expenses = [], isLoading: expensesLoading } = useExpenses();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalExpense, setModalExpense] = useState<Expense | null>(null);
  const [receiptExpense, setReceiptExpense] = useState<Expense | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const grantMode = currentEvent?.grantMode ?? false;

  const filterFn = useMemo(() => buildFilterFn(filters), [filters]);

  const handleOpenModal = useCallback((expense?: Expense) => {
    setModalExpense(expense ?? null);
    setModalOpen(true);
  }, []);

  const handleOpenReceipts = useCallback((expense: Expense) => {
    setReceiptExpense(expense);
    setReceiptDialogOpen(true);
  }, []);

  if (isLoading || !currentEvent) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-muted-foreground">
            {isLoading ? "Loading..." : "No event selected. Create or join an event to get started."}
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6">
        {/* Header row */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{currentEvent.name}</h2>
            {currentEvent.description && (
              <p className="text-sm text-muted-foreground">
                {currentEvent.description}
              </p>
            )}
          </div>
          <Button onClick={() => handleOpenModal()}>
            <Plus className="mr-1.5 size-4" />
            Add Expense
          </Button>
        </div>

        {/* Main content: table/kanban + summary sidebar */}
        <div className="flex gap-6">
          {/* Left: main content */}
          <div className="min-w-0 flex-1">
            {/* Filters */}
            <div className="mb-4">
              <ExpenseFilters
                filters={filters}
                onFiltersChange={setFilters}
                grantMode={grantMode}
              />
            </div>

            {/* View toggle: Table / Kanban */}
            <Tabs defaultValue="table">
              <TabsList>
                <TabsTrigger value="table">
                  <Table2 className="mr-1.5 size-4" />
                  Table
                </TabsTrigger>
                <TabsTrigger value="kanban">
                  <LayoutGrid className="mr-1.5 size-4" />
                  Kanban
                </TabsTrigger>
              </TabsList>

              <TabsContent value="table" className="mt-3">
                {expensesLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <p className="text-muted-foreground">
                      Loading expenses...
                    </p>
                  </div>
                ) : (
                  <ExpenseTable
                    expenses={expenses}
                    members={members}
                    buckets={buckets}
                    grantMode={grantMode}
                    onOpenModal={handleOpenModal}
                    onOpenReceipts={handleOpenReceipts}
                    filterFn={filterFn}
                  />
                )}
              </TabsContent>

              <TabsContent value="kanban" className="mt-3">
                {expensesLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <p className="text-muted-foreground">
                      Loading expenses...
                    </p>
                  </div>
                ) : (
                  <ExpenseKanban
                    expenses={expenses}
                    members={members}
                    buckets={buckets}
                    filterFn={filterFn}
                    onOpenModal={handleOpenModal}
                    onOpenReceipts={handleOpenReceipts}
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: summary sidebar */}
          <div className="hidden w-72 shrink-0 lg:block">
            <SummaryPanel />
          </div>
        </div>
      </div>

      {/* Modals */}
      <ExpenseModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        expense={modalExpense}
        members={members}
        buckets={buckets}
        grantCategories={grantCategories}
        grantMode={grantMode}
      />

      <ReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        expense={receiptExpense}
      />
    </AppShell>
  );
}
