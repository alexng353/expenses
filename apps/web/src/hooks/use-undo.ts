import { useCallback, useEffect, useRef, useState } from "react";
import { useUpdateExpense } from "./use-expenses";
import type { Expense } from "../lib/types";

interface UndoEntry {
  expenseId: string;
  expenseName: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

const MAX_STACK = 50;

export function useUndoStack() {
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const updateExpense = useUpdateExpense();

  const showToast = useCallback((message: string) => {
    setToast({ message });
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const push = useCallback(
    (expense: Expense, field: string, oldValue: unknown, newValue?: unknown) => {
      const entry: UndoEntry = {
        expenseId: expense.id,
        expenseName: expense.name,
        field,
        oldValue,
        newValue: newValue ?? null,
        timestamp: Date.now(),
      };
      setUndoStack((prev) => [entry, ...prev].slice(0, MAX_STACK));
      setRedoStack([]);
      showToast(`Updated ${expense.name}`);
    },
    [showToast]
  );

  const pushBatch = useCallback(
    (entries: { expense: Expense; field: string; oldValue: unknown }[]) => {
      const newEntries: UndoEntry[] = entries.map((e) => ({
        expenseId: e.expense.id,
        expenseName: e.expense.name,
        field: e.field,
        oldValue: e.oldValue,
        newValue: null,
        timestamp: Date.now(),
      }));
      setUndoStack((prev) => [...newEntries, ...prev].slice(0, MAX_STACK));
      setRedoStack([]);
      showToast(`Updated ${entries.length} expenses`);
    },
    [showToast]
  );

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const [entry, ...rest] = prev;
      updateExpense.mutate({
        id: entry!.expenseId,
        [entry!.field]: entry!.oldValue,
      } as any);
      setRedoStack((r) => [entry!, ...r].slice(0, MAX_STACK));
      showToast(`Undid change to ${entry!.expenseName}`);
      return rest;
    });
  }, [updateExpense, showToast]);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const [entry, ...rest] = prev;
      updateExpense.mutate({
        id: entry!.expenseId,
        [entry!.field]: entry!.newValue,
      } as any);
      setUndoStack((u) => [entry!, ...u].slice(0, MAX_STACK));
      showToast(`Redid change to ${entry!.expenseName}`);
      return rest;
    });
  }, [updateExpense, showToast]);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (undoStack.length === 0) return;
        e.preventDefault();
        undo();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        ((e.key === "z" && e.shiftKey) || e.key === "r")
      ) {
        if (redoStack.length === 0) return;
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undoStack.length, redoStack.length, undo, redo]);

  return {
    push,
    pushBatch,
    undo,
    redo,
    toast,
    dismissToast,
    undoSize: undoStack.length,
    redoSize: redoStack.length,
  };
}
