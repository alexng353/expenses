import { useMemo, useRef, useState, useEffect, useCallback } from "react"
import { useExpenseSummary } from "../../hooks/use-expenses"
import { formatCurrency } from "../../lib/format"
import {
  formatSummaryMarkdown,
  formatSummaryPlaintext,
  copyText,
  copyPng,
} from "../../lib/copy"
import { Separator } from "@workspace/ui/components/separator"
import type { Expense, EventBucket, EventSummary } from "../../lib/types"

interface SummaryPanelProps {
  selectedExpenses?: Expense[]
  buckets?: EventBucket[]
}

export function SummaryPanel({
  selectedExpenses = [],
  buckets = [],
}: SummaryPanelProps) {
  const { data: summary, isLoading } = useExpenseSummary()
  const panelRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }, [])

  // Compute selected breakdown
  const selectedSummary = useMemo(() => {
    if (selectedExpenses.length === 0) return null
    const totalCents = selectedExpenses.reduce(
      (sum, e) => sum + e.amountCents,
      0
    )
    const byBucket = new Map<
      string | null,
      { name: string; totalCents: number; count: number }
    >()
    for (const e of selectedExpenses) {
      const key = e.bucketId
      const existing = byBucket.get(key)
      const bucketName = buckets.find((b) => b.id === key)?.name ?? "No bucket"
      if (existing) {
        existing.totalCents += e.amountCents
        existing.count += 1
      } else {
        byBucket.set(key, {
          name: bucketName,
          totalCents: e.amountCents,
          count: 1,
        })
      }
    }
    return {
      totalCents,
      count: selectedExpenses.length,
      byBucket: Array.from(byBucket.entries()),
    }
  }, [selectedExpenses, buckets])

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-3/4 rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (!summary) return null

  return (
    <div
      ref={panelRef}
      onContextMenu={handleContextMenu}
      className="space-y-4"
    >
      {/* Selected expenses section */}
      {selectedSummary && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h3 className="text-sm font-semibold">
            {selectedSummary.count} selected
          </h3>

          <div className="mt-3 space-y-2">
            {selectedSummary.byBucket.map(([bucketId, data]) => (
              <div
                key={bucketId ?? "none"}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate text-muted-foreground">
                  {data.name}
                </span>
                <span className="ml-2 shrink-0 font-medium tabular-nums">
                  {formatCurrency(data.totalCents)}
                </span>
              </div>
            ))}
          </div>

          {selectedSummary.byBucket.length > 0 && (
            <Separator className="my-3" />
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Selected Total</span>
            <span className="text-base font-bold tabular-nums">
              {formatCurrency(selectedSummary.totalCents)}
            </span>
          </div>

          <div className="mt-1 text-right text-xs text-muted-foreground">
            {formatCurrency(selectedSummary.totalCents)} /{" "}
            {formatCurrency(summary.totalCents)} (
            {summary.totalCents > 0
              ? Math.round(
                  (selectedSummary.totalCents / summary.totalCents) * 100
                )
              : 0}
            %)
          </div>
        </div>
      )}

      {/* All expenses summary */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Budget Summary</h3>

        <div className="mt-3 space-y-2">
          {summary.byBucket.map((bucket) => (
            <div
              key={bucket.bucketId ?? "none"}
              className="flex items-center justify-between text-sm"
            >
              <span className="truncate text-muted-foreground">
                {bucket.bucketName}
              </span>
              <span className="ml-2 shrink-0 font-medium tabular-nums">
                {formatCurrency(bucket.totalCents)}
              </span>
            </div>
          ))}
        </div>

        {summary.byBucket.length > 0 && <Separator className="my-3" />}

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-base font-bold tabular-nums">
            {formatCurrency(summary.totalCents)}
          </span>
        </div>

        <div className="mt-1 text-right text-xs text-muted-foreground">
          {summary.totalCount} expense{summary.totalCount !== 1 ? "s" : ""}
        </div>

        {/* Status breakdown */}
        {Object.keys(summary.byStatus).length > 0 && (
          <>
            <Separator className="my-3" />
            <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase">
              By Status
            </h4>
            <div className="space-y-1">
              {Object.entries(summary.byStatus).map(([status, data]) => (
                <div
                  key={status}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground capitalize">
                    {status.replace(/_/g, " ")}
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(data.totalCents)}
                    <span className="ml-1 text-muted-foreground">
                      ({data.count})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {menuPos && (
        <SummaryCopyMenu
          summary={summary}
          buckets={buckets}
          panelRef={panelRef}
          position={menuPos}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  )
}

function SummaryCopyMenu({
  summary,
  buckets,
  panelRef,
  position,
  onClose,
}: {
  summary: EventSummary
  buckets: EventBucket[]
  panelRef: React.RefObject<HTMLDivElement | null>
  position: { x: number; y: number }
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handler)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: position.x, top: position.y }}
    >
      <button
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        onClick={() => {
          copyText(formatSummaryMarkdown(summary, buckets))
          onClose()
        }}
      >
        Copy as Markdown
      </button>
      <button
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        onClick={() => {
          copyText(formatSummaryPlaintext(summary, buckets))
          onClose()
        }}
      >
        Copy as Plaintext
      </button>
      <button
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        onClick={() => {
          if (panelRef.current) copyPng(panelRef.current)
          onClose()
        }}
      >
        Copy as Image
      </button>
    </div>
  )
}
