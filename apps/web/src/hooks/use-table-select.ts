import { useState, useCallback, useRef, useEffect, useMemo } from "react";

const DRAG_THRESHOLD = 3;

/** Tags that should never trigger row selection on click/mousedown */
const INTERACTIVE_SELECTORS =
  'input, textarea, select, button, a, [role="checkbox"], [role="button"], [role="link"], [data-slot="checkbox"]';

function isInteractive(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.closest(INTERACTIVE_SELECTORS) !== null;
}

interface PendingAction {
  startX: number;
  startY: number;
  /** Selection state at the moment of mousedown (for ctrl+marquee additive) */
  frozenSelection: Set<string>;
  ctrlKey: boolean;
  shiftKey: boolean;
  /** The row that was mousedown-ed on (null = container background) */
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
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  const pendingRef = useRef<PendingAction | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Keep a stable ref to rowIds for range computation
  const rowIdsRef = useRef(rowIds);
  useEffect(() => { rowIdsRef.current = rowIds; }, [rowIds]);

  // Keep a stable ref to anchorId for use in handlers
  const anchorIdRef = useRef(anchorId);
  useEffect(() => { anchorIdRef.current = anchorId; }, [anchorId]);

  // Keep a stable ref to selected for use in handlers
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Keep a ref to marquee for stale-closure-safe checks in mouseup
  const marqueeRef = useRef(marquee);
  useEffect(() => { marqueeRef.current = marquee; }, [marquee]);

  /**
   * Compute the range of IDs between two row IDs (inclusive), using the
   * current visible order.
   */
  const getRange = useCallback((fromId: string, toId: string): string[] => {
    const ids = rowIdsRef.current;
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return [];
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    return ids.slice(lo, hi + 1);
  }, []);

  /**
   * Compute which row IDs intersect with the given rectangle (relative to
   * the container's scroll viewport).
   */
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
      // Convert element rect to container-relative coords (accounting for scroll)
      const elTop = elRect.top - containerRect.top + scrollTop;
      const elBottom = elTop + elRect.height;
      const elLeft = elRect.left - containerRect.left + scrollLeft;
      const elRight = elLeft + elRect.width;

      // AABB intersection
      if (elRight >= minX && elLeft <= maxX && elBottom >= minY && elTop <= maxY) {
        result.push(id);
      }
    });

    return result;
  }, []);

  // --- Click selection logic ---
  const handleClick = useCallback(
    (rowId: string | null, ctrlKey: boolean, shiftKey: boolean) => {
      if (rowId === null) {
        // Clicked on container background
        if (!ctrlKey && !shiftKey) {
          setSelected(new Set());
        }
        return;
      }

      if (shiftKey && anchorIdRef.current) {
        // Shift-click: range selection
        const range = getRange(anchorIdRef.current, rowId);
        const rangeSet = new Set(range);
        if (ctrlKey) {
          // Shift+Ctrl: add range to existing
          setSelected((prev) => {
            const next = new Set(prev);
            for (const id of rangeSet) next.add(id);
            return next;
          });
        } else {
          // Shift only: replace with range
          setSelected(rangeSet);
        }
      } else if (ctrlKey || shiftKey) {
        // Ctrl-click: toggle single row
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(rowId)) {
            next.delete(rowId);
          } else {
            next.add(rowId);
          }
          return next;
        });
        setAnchorId(rowId);
      } else {
        // Plain click: select single
        setSelected(new Set([rowId]));
        setAnchorId(rowId);
      }
    },
    [getRange]
  );

  // --- Global mousemove/mouseup ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;

      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;

      const currentX = e.clientX - containerRect.left + scrollLeft;
      const currentY = e.clientY - containerRect.top + scrollTop;

      const dx = currentX - pending.startX;
      const dy = currentY - pending.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < DRAG_THRESHOLD) return;

      // Past threshold -- activate marquee
      const rect: MarqueeRect = {
        startX: pending.startX,
        startY: pending.startY,
        currentX,
        currentY,
      };
      setMarquee(rect);

      // Compute intersecting rows
      const intersected = getIntersectingRows(rect);
      if (pending.ctrlKey) {
        // Additive: merge with frozen selection
        const next = new Set(pending.frozenSelection);
        for (const id of intersected) next.add(id);
        setSelected(next);
      } else {
        setSelected(new Set(intersected));
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;

      pendingRef.current = null;

      if (marqueeRef.current) {
        // Marquee was active -- selection already updated during mousemove
        setMarquee(null);
        return;
      }

      // Didn't exceed threshold -- treat as click
      // But only if the mousedown was on a row (not intercepted by interactive element)
      handleClick(pending.rowId, pending.ctrlKey || e.ctrlKey || e.metaKey, pending.shiftKey || e.shiftKey);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleClick, getIntersectingRows]);

  // --- Container mousedown (for marquee from blank area) ---
  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only left button
      if (e.button !== 0) return;
      // Don't start selection from interactive elements
      if (isInteractive(e.target)) return;

      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;

      const startX = e.clientX - containerRect.left + scrollLeft;
      const startY = e.clientY - containerRect.top + scrollTop;

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

  // --- Row mousedown ---
  const handleRowMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>, rowId: string) => {
      // Only left button
      if (e.button !== 0) return;
      // Don't start selection from interactive elements
      if (isInteractive(e.target)) return;

      const container = containerRef.current;
      if (!container) return;

      // Prevent the container handler from also firing
      e.stopPropagation();

      const containerRect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;

      const startX = e.clientX - containerRect.left + scrollLeft;
      const startY = e.clientY - containerRect.top + scrollTop;

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

  // --- Register row ref ---
  const registerRowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) {
        rowRefs.current.set(id, el);
      } else {
        rowRefs.current.delete(id);
      }
    },
    []
  );

  // --- Select / deselect all ---
  const selectAll = useCallback(() => {
    setSelected(new Set(rowIdsRef.current));
    if (rowIdsRef.current.length > 0) {
      setAnchorId(rowIdsRef.current[0]!);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  // --- Handle checkbox click with shift support ---
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
        // Toggle single
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(rowId)) {
            next.delete(rowId);
          } else {
            next.add(rowId);
          }
          return next;
        });
        setAnchorId(rowId);
      }
    },
    [getRange]
  );

  // --- Marquee style ---
  const marqueeStyle = useMemo(() => {
    if (!marquee) return null;
    const left = Math.min(marquee.startX, marquee.currentX);
    const top = Math.min(marquee.startY, marquee.currentY);
    const width = Math.abs(marquee.currentX - marquee.startX);
    const height = Math.abs(marquee.currentY - marquee.startY);
    return { left, top, width, height } as const;
  }, [marquee]);

  // --- Public API ---
  const getContainerProps = useCallback(() => {
    return {
      ref: containerRef,
      onMouseDown: handleContainerMouseDown,
      style: {
        position: "relative" as const,
        ...(marquee ? { userSelect: "none" as const } : {}),
      },
    };
  }, [handleContainerMouseDown, marquee]);

  const getRowProps = useCallback(
    (id: string) => {
      return {
        ref: registerRowRef(id),
        onMouseDown: (e: React.MouseEvent<HTMLElement>) =>
          handleRowMouseDown(e, id),
      };
    },
    [registerRowRef, handleRowMouseDown]
  );

  return {
    selected,
    setSelected,
    selectAll,
    clearSelection,
    handleCheckboxClick,
    getContainerProps,
    getRowProps,
    marqueeStyle,
  };
}
