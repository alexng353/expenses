import { useCallback, useEffect, useRef, useState } from "react";
import { useUpdateExpense } from "./use-expenses";
const MAX_STACK = 50;
export function useUndoStack() {
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [toast, setToast] = useState(null);
    const toastTimeoutRef = useRef(undefined);
    const updateExpense = useUpdateExpense();
    const showToast = useCallback((message) => {
        setToast({ message });
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
    }, []);
    const push = useCallback((expense, field, oldValue, newValue) => {
        const entry = {
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
    }, [showToast]);
    const pushBatch = useCallback((entries) => {
        const newEntries = entries.map((e) => ({
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
    }, [showToast]);
    const undo = useCallback(() => {
        setUndoStack((prev) => {
            if (prev.length === 0)
                return prev;
            const [entry, ...rest] = prev;
            updateExpense.mutate({
                id: entry.expenseId,
                [entry.field]: entry.oldValue,
            });
            setRedoStack((r) => [entry, ...r].slice(0, MAX_STACK));
            showToast(`Undid change to ${entry.expenseName}`);
            return rest;
        });
    }, [updateExpense, showToast]);
    const redo = useCallback(() => {
        setRedoStack((prev) => {
            if (prev.length === 0)
                return prev;
            const [entry, ...rest] = prev;
            updateExpense.mutate({
                id: entry.expenseId,
                [entry.field]: entry.newValue,
            });
            setUndoStack((u) => [entry, ...u].slice(0, MAX_STACK));
            showToast(`Redid change to ${entry.expenseName}`);
            return rest;
        });
    }, [updateExpense, showToast]);
    const dismissToast = useCallback(() => setToast(null), []);
    useEffect(() => {
        const handler = (e) => {
            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")
                return;
            if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
                if (undoStack.length === 0)
                    return;
                e.preventDefault();
                undo();
            }
            if ((e.ctrlKey || e.metaKey) &&
                ((e.key === "z" && e.shiftKey) || e.key === "r")) {
                if (redoStack.length === 0)
                    return;
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
