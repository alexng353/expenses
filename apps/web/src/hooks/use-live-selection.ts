import { useEffect, useRef, useState } from "react";
import type { Expense } from "../lib/types";

/**
 * Subscribes to live marquee selection updates and derives summary info
 * (count, total) without re-rendering the table. Updates at most once per
 * animation frame via the selection hook's listener.
 */
export function useLiveSelection(
  expenses: Expense[],
  committedSelected: Set<string>,
  marqueeActive: boolean,
  subscribeLive: (listener: (ids: Set<string>) => void) => () => void
) {
  const [liveIds, setLiveIds] = useState<Set<string>>(committedSelected);
  const expensesRef = useRef(expenses);
  useEffect(() => { expensesRef.current = expenses; }, [expenses]);

  // When marquee is not active, track committed selection
  useEffect(() => {
    if (!marqueeActive) setLiveIds(committedSelected);
  }, [committedSelected, marqueeActive]);

  // During marquee, subscribe to the rAF-driven updates
  useEffect(() => {
    if (!marqueeActive) return;
    return subscribeLive((ids) => setLiveIds(new Set(ids)));
  }, [marqueeActive, subscribeLive]);

  const liveExpenses = expenses.filter((e) => liveIds.has(e.id));
  const liveCount = liveIds.size;
  const liveTotal = liveExpenses.reduce((s, e) => s + e.amountCents, 0);

  return { liveIds, liveExpenses, liveCount, liveTotal };
}
