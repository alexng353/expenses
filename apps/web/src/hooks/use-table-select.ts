import { useState, useCallback, useRef, useEffect } from "react"

const DRAG_THRESHOLD = 3

const INTERACTIVE_SELECTORS =
  'input, textarea, select, button, a, [role="checkbox"], [role="button"], [role="link"], [data-slot="checkbox"], [data-slot="popover-trigger"], [data-editable], [class*="cursor-col-resize"], .ag-header'

function isInteractive(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.closest(INTERACTIVE_SELECTORS) !== null
}

interface MarqueeRect {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface UseMarqueeSelectOptions {
  containerRef: React.RefObject<HTMLDivElement | null>
  onMarqueeSelect: (ids: string[]) => void
}

export function useMarqueeSelect({
  containerRef,
  onMarqueeSelect,
}: UseMarqueeSelectOptions) {
  const [marqueeActive, setMarqueeActive] = useState(false)
  const marqueeElRef = useRef<HTMLDivElement | null>(null)
  const marqueeRectRef = useRef<MarqueeRect | null>(null)
  const marqueeActivatedRef = useRef(false)
  const pendingRef = useRef<{
    startX: number
    startY: number
    ctrlKey: boolean
  } | null>(null)
  const rafRef = useRef<number>(0)

  // Pending selection during marquee
  const pendingSelectionRef = useRef<Set<string>>(new Set())
  // Live listeners for marquee updates (summary panel, toolbar)
  const liveListenersRef = useRef<Set<(ids: Set<string>) => void>>(new Set())

  const getIntersectingRows = useCallback(
    (rect: MarqueeRect): string[] => {
      const container = containerRef.current
      if (!container) return []

      const minX = Math.min(rect.startX, rect.currentX)
      const maxX = Math.max(rect.startX, rect.currentX)
      const minY = Math.min(rect.startY, rect.currentY)
      const maxY = Math.max(rect.startY, rect.currentY)

      const result: string[] = []
      const containerRect = container.getBoundingClientRect()
      const scrollLeft = container.scrollLeft
      const scrollTop = container.scrollTop

      // Query AG Grid row elements by [row-id] attribute
      const rowElements = container.querySelectorAll<HTMLElement>("[row-id]")
      rowElements.forEach((el) => {
        const rowId = el.getAttribute("row-id")
        if (!rowId || rowId === "0") return // Skip header or invalid

        const elRect = el.getBoundingClientRect()
        const elTop = elRect.top - containerRect.top + scrollTop
        const elBottom = elTop + elRect.height
        const elLeft = elRect.left - containerRect.left + scrollLeft
        const elRight = elLeft + elRect.width

        if (
          elRight >= minX &&
          elLeft <= maxX &&
          elBottom >= minY &&
          elTop <= maxY
        ) {
          result.push(rowId)
        }
      })

      return result
    },
    [containerRef]
  )

  const updateMarqueeDiv = useCallback((rect: MarqueeRect) => {
    const el = marqueeElRef.current
    if (!el) return
    const left = Math.min(rect.startX, rect.currentX)
    const top = Math.min(rect.startY, rect.currentY)
    const width = Math.abs(rect.currentX - rect.startX)
    const height = Math.abs(rect.currentY - rect.startY)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.style.width = `${width}px`
    el.style.height = `${height}px`
    el.style.display = "block"
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const pending = pendingRef.current
      if (!pending) return

      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const currentX = e.clientX - containerRect.left + container.scrollLeft
      const currentY = e.clientY - containerRect.top + container.scrollTop

      const dx = currentX - pending.startX
      const dy = currentY - pending.startY

      if (
        !marqueeRectRef.current &&
        dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD
      )
        return

      const rect: MarqueeRect = {
        startX: pending.startX,
        startY: pending.startY,
        currentX,
        currentY,
      }
      marqueeRectRef.current = rect

      if (!marqueeActivatedRef.current) {
        marqueeActivatedRef.current = true
        setMarqueeActive(true)
      }

      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        updateMarqueeDiv(rect)
        const intersected = new Set(getIntersectingRows(rect))
        pendingSelectionRef.current = intersected
        for (const listener of liveListenersRef.current) {
          listener(pendingSelectionRef.current)
        }
      })
    }

    const handleMouseUp = () => {
      const pending = pendingRef.current
      if (!pending) return
      pendingRef.current = null
      cancelAnimationFrame(rafRef.current)

      if (marqueeRectRef.current) {
        const selectedIds = Array.from(pendingSelectionRef.current)
        onMarqueeSelect(selectedIds)
        marqueeRectRef.current = null
        marqueeActivatedRef.current = false
        setMarqueeActive(false)
        if (marqueeElRef.current) marqueeElRef.current.style.display = "none"
        return
      }
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef, getIntersectingRows, updateMarqueeDiv, onMarqueeSelect])

  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      if (isInteractive(e.target)) return

      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const startX = e.clientX - containerRect.left + container.scrollLeft
      const startY = e.clientY - containerRect.top + container.scrollTop

      pendingRef.current = {
        startX,
        startY,
        ctrlKey: e.ctrlKey || e.metaKey,
      }
    },
    [containerRef]
  )

  const getContainerProps = useCallback(
    () => ({
      onMouseDown: handleContainerMouseDown,
      style: {
        position: "relative" as const,
        ...(marqueeActive ? { userSelect: "none" as const } : {}),
      },
    }),
    [handleContainerMouseDown, marqueeActive]
  )

  const marqueeRef = useCallback((el: HTMLDivElement | null) => {
    marqueeElRef.current = el
    if (el) el.style.display = "none"
  }, [])

  const subscribeLive = useCallback((listener: (ids: Set<string>) => void) => {
    liveListenersRef.current.add(listener)
    return () => {
      liveListenersRef.current.delete(listener)
    }
  }, [])

  return {
    getContainerProps,
    marqueeActive,
    marqueeRef,
    subscribeLive,
  }
}
