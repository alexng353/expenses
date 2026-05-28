import { useState, useCallback, useRef, useEffect } from "react";
const DRAG_THRESHOLD = 3;
const INTERACTIVE_SELECTORS = 'input, textarea, select, button, a, [role="checkbox"], [role="button"], [role="link"], [data-slot="checkbox"], [data-slot="popover-trigger"], [data-editable], [class*="cursor-col-resize"], .ag-header, .ag-checkbox-input, .ag-selection-checkbox, .ag-cell-edit-wrapper';
function isInteractive(el) {
    if (!(el instanceof HTMLElement))
        return false;
    return el.closest(INTERACTIVE_SELECTORS) !== null;
}
export function useMarqueeSelect({ containerRef, onMarqueeSelect, }) {
    const [marqueeActive, setMarqueeActive] = useState(false);
    const marqueeElRef = useRef(null);
    const marqueeRectRef = useRef(null);
    const marqueeActivatedRef = useRef(false);
    const pendingRef = useRef(null);
    const rafRef = useRef(0);
    // Pending selection during marquee
    const pendingSelectionRef = useRef(new Set());
    // Live listeners for marquee updates (summary panel, toolbar)
    const liveListenersRef = useRef(new Set());
    const getIntersectingRows = useCallback((rect) => {
        const container = containerRef.current;
        if (!container)
            return [];
        const minX = Math.min(rect.startX, rect.currentX);
        const maxX = Math.max(rect.startX, rect.currentX);
        const minY = Math.min(rect.startY, rect.currentY);
        const maxY = Math.max(rect.startY, rect.currentY);
        const result = [];
        const containerRect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;
        // Query AG Grid row elements by [row-id] attribute
        const rowElements = container.querySelectorAll("[row-id]");
        rowElements.forEach((el) => {
            const rowId = el.getAttribute("row-id");
            if (!rowId || rowId === "0")
                return; // Skip header or invalid
            const elRect = el.getBoundingClientRect();
            const elTop = elRect.top - containerRect.top + scrollTop;
            const elBottom = elTop + elRect.height;
            const elLeft = elRect.left - containerRect.left + scrollLeft;
            const elRight = elLeft + elRect.width;
            if (elRight >= minX &&
                elLeft <= maxX &&
                elBottom >= minY &&
                elTop <= maxY) {
                result.push(rowId);
            }
        });
        return result;
    }, [containerRef]);
    const updateMarqueeDiv = useCallback((rect) => {
        const el = marqueeElRef.current;
        if (!el)
            return;
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
    useEffect(() => {
        const handleMouseMove = (e) => {
            const pending = pendingRef.current;
            if (!pending)
                return;
            const container = containerRef.current;
            if (!container)
                return;
            const containerRect = container.getBoundingClientRect();
            const currentX = e.clientX - containerRect.left + container.scrollLeft;
            const currentY = e.clientY - containerRect.top + container.scrollTop;
            const dx = currentX - pending.startX;
            const dy = currentY - pending.startY;
            if (!marqueeRectRef.current &&
                dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD)
                return;
            const rect = {
                startX: pending.startX,
                startY: pending.startY,
                currentX,
                currentY,
            };
            marqueeRectRef.current = rect;
            if (!marqueeActivatedRef.current) {
                marqueeActivatedRef.current = true;
                setMarqueeActive(true);
            }
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                updateMarqueeDiv(rect);
                const intersected = new Set(getIntersectingRows(rect));
                pendingSelectionRef.current = intersected;
                // Highlight AG Grid rows during drag via CSS class
                const container = containerRef.current;
                if (container) {
                    container
                        .querySelectorAll("[row-id]")
                        .forEach((el) => {
                        const rowId = el.getAttribute("row-id");
                        if (rowId && intersected.has(rowId)) {
                            el.classList.add("ag-row-selected");
                        }
                        else {
                            el.classList.remove("ag-row-selected");
                        }
                    });
                }
                for (const listener of liveListenersRef.current) {
                    listener(pendingSelectionRef.current);
                }
            });
        };
        const handleMouseUp = () => {
            const pending = pendingRef.current;
            if (!pending)
                return;
            pendingRef.current = null;
            cancelAnimationFrame(rafRef.current);
            if (marqueeRectRef.current) {
                const selectedIds = Array.from(pendingSelectionRef.current);
                onMarqueeSelect(selectedIds);
                marqueeRectRef.current = null;
                marqueeActivatedRef.current = false;
                setMarqueeActive(false);
                if (marqueeElRef.current)
                    marqueeElRef.current.style.display = "none";
                return;
            }
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            cancelAnimationFrame(rafRef.current);
        };
    }, [containerRef, getIntersectingRows, updateMarqueeDiv, onMarqueeSelect]);
    const handleContainerMouseDown = useCallback((e) => {
        if (e.button !== 0)
            return;
        if (isInteractive(e.target))
            return;
        const container = containerRef.current;
        if (!container)
            return;
        const containerRect = container.getBoundingClientRect();
        const startX = e.clientX - containerRect.left + container.scrollLeft;
        const startY = e.clientY - containerRect.top + container.scrollTop;
        pendingRef.current = {
            startX,
            startY,
            ctrlKey: e.ctrlKey || e.metaKey,
        };
    }, [containerRef]);
    const getContainerProps = useCallback(() => ({
        onMouseDown: handleContainerMouseDown,
        style: {
            position: "relative",
            ...(marqueeActive ? { userSelect: "none" } : {}),
        },
    }), [handleContainerMouseDown, marqueeActive]);
    const marqueeRef = useCallback((el) => {
        marqueeElRef.current = el;
        if (el)
            el.style.display = "none";
    }, []);
    const subscribeLive = useCallback((listener) => {
        liveListenersRef.current.add(listener);
        return () => {
            liveListenersRef.current.delete(listener);
        };
    }, []);
    return {
        getContainerProps,
        marqueeActive,
        marqueeRef,
        subscribeLive,
    };
}
