import { useState, useCallback, useRef, useEffect, useMemo } from "react";

const DRAG_THRESHOLD = 3;

const INTERACTIVE_SELECTORS =
  'input, textarea, select, button, a, [role="checkbox"], [role="button"], [role="link"], [data-slot="checkbox"], [data-slot="popover-trigger"], [data-editable], [class*="cursor-col-resize"], thead';

function isInteractive(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.closest(INTERACTIVE_SELECTORS) !== null;
}

interface PendingAction {
  startX: number;
  startY: number;
  frozenSelection: Set<string>;
  ctrlKey: boolean;
  shiftKey: boolean;
  rowId: string | null;
}

interface MarqueeRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function useTableSelect(rowIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // Marquee state: only the div style is driven by a ref + rAF for zero re-renders during drag
  const [marqueeActive, setMarqueeActive] = useState(false);
  const marqueeElRef = useRef<HTMLDivElement | null>(null);
  const marqueeRectRef = useRef<MarqueeRect | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const rafRef = useRef<number>(0);

  // Pending selection during marquee — committed on mouseup
  const pendingSelectionRef = useRef<Set<string>>(new Set());
  // Subscribers that want live updates during marquee (toolbar, summary)
  const liveListenersRef = useRef<Set<(ids: Set<string>) => void>>(new Set());

  const rowIdsRef = useRef(rowIds);
  useEffect(() => { rowIdsRef.current = rowIds; }, [rowIds]);

  const anchorIdRef = useRef(anchorId);
  useEffect(() => { anchorIdRef.current = anchorId; }, [anchorId]);

  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const getRange = useCallback((fromId: string, toId: string): string[] => {
    const ids = rowIdsRef.current;
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return [];
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    return ids.slice(lo, hi + 1);
  }, []);

  const getIntersectingRows = useCallback((rect: MarqueeRect): string[] => {
    const container = containerRef.current;
    if (!container) return [];

    const minX = Math.min(rect.startX, rect.currentX);
    const maxX = Math.max(rect.startX, rect.currentX);
    const minY = Math.min(rect.startY, rect.currentY);
    const maxY = Math.max(rect.startY, rect.currentY);

    const result: string[] = [];
    const containerRect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    rowRefs.current.forEach((el, id) => {
      const elRect = el.getBoundingClientRect();
      const elTop = elRect.top - containerRect.top + scrollTop;
      const elBottom = elTop + elRect.height;
      const elLeft = elRect.left - containerRect.left + scrollLeft;
      const elRight = elLeft + elRect.width;

      if (elRight >= minX && elLeft <= maxX && elBottom >= minY && elTop <= maxY) {
        result.push(id);
      }
    });

    return result;
  }, []);

  const handleClick = useCallback(
    (rowId: string | null, ctrlKey: boolean, shiftKey: boolean) => {
      if (rowId === null) {
        if (!ctrlKey && !shiftKey) setSelected(new Set());
        return;
      }

      if (shiftKey && anchorIdRef.current) {
        const range = getRange(anchorIdRef.current, rowId);
        const rangeSet = new Set(range);
        if (ctrlKey) {
          setSelected((prev) => {
            const next = new Set(prev);
            for (const id of rangeSet) next.add(id);
            return next;
          });
        } else {
          setSelected(rangeSet);
        }
      } else if (ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(rowId)) next.delete(rowId);
          else next.add(rowId);
          return next;
        });
        setAnchorId(rowId);
      } else {
        setSelected(new Set([rowId]));
        setAnchorId(rowId);
      }
    },
    [getRange]
  );

  // --- Marquee: update the div position via DOM, not React state ---
  const updateMarqueeDiv = useCallback((rect: MarqueeRect) => {
    const el = marqueeElRef.current;
    if (!el) return;
    const left = Math.min(rect.startX, rect.currentX);
    const top = Math.min(rect.startY, rect.currentY);
    const width = Math.abs(rect.currentX - rect.startX);
    const height = Math.abs(rect.currentY - rect.startY);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.display = "block";
  }, []);

  // Highlight rows during marquee via data attribute (no React re-render)
  const updateRowHighlights = useCallback((intersected: Set<string>, frozen: Set<string>, ctrlKey: boolean) => {
    const combined = ctrlKey
      ? new Set([...frozen, ...intersected])
      : intersected;

    rowRefs.current.forEach((el, id) => {
      const isSelected = combined.has(id);
      if (isSelected) {
        el.setAttribute("data-state", "selected");
      } else {
        el.removeAttribute("data-state");
      }
    });
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;

      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const currentX = e.clientX - containerRect.left + container.scrollLeft;
      const currentY = e.clientY - containerRect.top + container.scrollTop;

      const dx = currentX - pending.startX;
      const dy = currentY - pending.startY;

      if (!marqueeRectRef.current && (dx * dx + dy * dy) < DRAG_THRESHOLD * DRAG_THRESHOLD) return;

      // Activate or update marquee — all via refs, no setState
      const rect: MarqueeRect = {
        startX: pending.startX,
        startY: pending.startY,
        currentX,
        currentY,
      };
      marqueeRectRef.current = rect;

      if (!marqueeElRef.current) {
        setMarqueeActive(true);
      }

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        updateMarqueeDiv(rect);
        const intersected = new Set(getIntersectingRows(rect));
        pendingSelectionRef.current = pending.ctrlKey
          ? new Set([...pending.frozenSelection, ...intersected])
          : intersected;
        updateRowHighlights(intersected, pending.frozenSelection, pending.ctrlKey);
        for (const listener of liveListenersRef.current) {
          listener(pendingSelectionRef.current);
        }
      });
    };

    const handleMouseUp = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      cancelAnimationFrame(rafRef.current);

      if (marqueeRectRef.current) {
        // Commit the pending selection computed during rAF
        setSelected(new Set(pendingSelectionRef.current));
        marqueeRectRef.current = null;
        setMarqueeActive(false);
        if (marqueeElRef.current) marqueeElRef.current.style.display = "none";
        // Restore data-state from React on next render
        return;
      }

      // Below threshold — treat as click
      handleClick(
        pending.rowId,
        pending.ctrlKey,
        pending.shiftKey
      );
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [handleClick, getIntersectingRows, updateMarqueeDiv, updateRowHighlights]);

  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (isInteractive(e.target)) return;

      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const startX = e.clientX - containerRect.left + container.scrollLeft;
      const startY = e.clientY - containerRect.top + container.scrollTop;

      pendingRef.current = {
        startX,
        startY,
        frozenSelection: new Set(selectedRef.current),
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
        rowId: null,
      };
    },
    []
  );

  const handleRowMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>, rowId: string) => {
      if (e.button !== 0) return;
      if (isInteractive(e.target)) return;

      const container = containerRef.current;
      if (!container) return;

      e.stopPropagation();

      const containerRect = container.getBoundingClientRect();
      const startX = e.clientX - containerRect.left + container.scrollLeft;
      const startY = e.clientY - containerRect.top + container.scrollTop;

      pendingRef.current = {
        startX,
        startY,
        frozenSelection: new Set(selectedRef.current),
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
        rowId,
      };
    },
    []
  );

  const registerRowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) rowRefs.current.set(id, el);
      else rowRefs.current.delete(id);
    },
    []
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(rowIdsRef.current));
    if (rowIdsRef.current.length > 0) setAnchorId(rowIdsRef.current[0]!);
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleCheckboxClick = useCallback(
    (rowId: string, shiftKey: boolean) => {
      if (shiftKey && anchorIdRef.current) {
        const range = getRange(anchorIdRef.current, rowId);
        const rangeSet = new Set(range);
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of rangeSet) next.add(id);
          return next;
        });
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(rowId)) next.delete(rowId);
          else next.add(rowId);
          return next;
        });
        setAnchorId(rowId);
      }
    },
    [getRange]
  );

  const getContainerProps = useCallback(() => ({
    ref: containerRef,
    onMouseDown: handleContainerMouseDown,
    style: {
      position: "relative" as const,
      ...(marqueeActive ? { userSelect: "none" as const } : {}),
    },
  }), [handleContainerMouseDown, marqueeActive]);

  const getRowProps = useCallback(
    (id: string) => ({
      ref: registerRowRef(id),
      onMouseDown: (e: React.MouseEvent<HTMLElement>) => handleRowMouseDown(e, id),
    }),
    [registerRowRef, handleRowMouseDown]
  );

  // Ref callback for the marquee div element
  const marqueeRef = useCallback((el: HTMLDivElement | null) => {
    marqueeElRef.current = el;
    if (el) el.style.display = "none";
  }, []);

  const subscribeLive = useCallback((listener: (ids: Set<string>) => void) => {
    liveListenersRef.current.add(listener);
    return () => { liveListenersRef.current.delete(listener); };
  }, []);

  return {
    selected,
    setSelected,
    selectAll,
    clearSelection,
    handleCheckboxClick,
    getContainerProps,
    getRowProps,
    marqueeActive,
    marqueeRef,
    subscribeLive,
  };
}
