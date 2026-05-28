import { useState, useCallback } from "react";
import { AppShell } from "../components/layout/app-shell";
import { ExpenseTable } from "../components/expenses/expense-table";
import { ExpenseKanban } from "../components/expenses/expense-kanban";
import { ExpenseModal } from "../components/expenses/expense-modal";
import { SummaryPanel } from "../components/summary/summary-panel";
import { ReceiptDialog } from "../components/expenses/receipt-dialog";
import { UndoToast } from "../components/shared/undo-toast";
import { useAuth } from "../hooks/use-auth";
import { useEvent } from "../hooks/use-event";
import { useExpenses } from "../hooks/use-expenses";
import { useExpenseWebSocket } from "../hooks/use-websocket";
import { useUndoStack } from "../hooks/use-undo";
import { ExportButton } from "../components/exports/export-button";
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
  const { user } = useAuth();
  const { currentEvent, members, buckets, grantCategories, isLoading } =
    useEvent();
  const { data: expenses = [], isLoading: expensesLoading } = useExpenses();
  useExpenseWebSocket();
  const undoStack = useUndoStack();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalExpense, setModalExpense] = useState<Expense | null>(null);
  const [receiptExpense, setReceiptExpense] = useState<Expense | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<Expense[]>([]);

  const grantMode = currentEvent?.grantMode ?? false;

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
          <div className="flex items-center gap-2">
            <ExportButton />
            <Button onClick={() => handleOpenModal()}>
              <Plus className="mr-1.5 size-4" />
              Add Expense
            </Button>
          </div>
        </div>

        {/* Main content: table/kanban + summary sidebar */}
        <div className="flex gap-6">
          {/* Left: main content */}
          <div className="min-w-0 flex-1">
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
                    undoStack={undoStack}
                    onSelectionChange={setSelectedExpenses}
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
                    onOpenModal={handleOpenModal}
                    onOpenReceipts={handleOpenReceipts}
                    undoStack={undoStack}
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: summary sidebar */}
          <div className="hidden w-72 shrink-0 lg:block">
            <SummaryPanel selectedExpenses={selectedExpenses} buckets={buckets} />
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
        currentUserId={user?.id}
      />

      <ReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        expense={receiptExpense}
      />

      {/* Undo toast */}
      {undoStack.toast && (
        <UndoToast
          message={undoStack.toast.message}
          onUndo={undoStack.undo}
          onRedo={undoStack.redo}
          onDismiss={undoStack.dismissToast}
          undoSize={undoStack.undoSize}
          redoSize={undoStack.redoSize}
        />
      )}
    </AppShell>
  );
}
