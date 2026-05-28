import { useCallback, useEffect, useRef, useState } from "react";
import { useUpdateExpense } from "./use-expenses";
import type { Expense } from "../lib/types";

interface UndoEntry {
  expenseId: string;
  expenseName: string;
  field: string;
  oldValue: unknown;
  timestamp: number;
}

const MAX_STACK = 50;

export function useUndoStack() {
  const [stack, setStack] = useState<UndoEntry[]>([]);
  const [toast, setToast] = useState<UndoEntry | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const updateExpense = useUpdateExpense();

  const push = useCallback(
    (expense: Expense, field: string, oldValue: unknown) => {
      const entry: UndoEntry = {
        expenseId: expense.id,
        expenseName: expense.name,
        field,
        oldValue,
        timestamp: Date.now(),
      };
      setStack((prev) => [entry, ...prev].slice(0, MAX_STACK));
      setToast(entry);

      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setToast(null), 5000);
    },
    []
  );

  const undo = useCallback(() => {
    setStack((prev) => {
      if (prev.length === 0) return prev;
      const [entry, ...rest] = prev;
      updateExpense.mutate({
        id: entry!.expenseId,
        [entry!.field]: entry!.oldValue,
      } as any);
      return rest;
    });
    setToast(null);
  }, [updateExpense]);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  // Ctrl+Z handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (stack.length === 0) return;
        // Don't undo if user is typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        undo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [stack.length, undo]);

  return { push, undo, toast, dismissToast, stackSize: stack.length };
}
