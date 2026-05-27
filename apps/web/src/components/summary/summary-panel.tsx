import { useExpenseSummary } from "../../hooks/use-expenses";
import { formatCurrency } from "../../lib/format";
import { Separator } from "@workspace/ui/components/separator";

export function SummaryPanel() {
  const { data: summary, isLoading } = useExpenseSummary();

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
    );
  }

  if (!summary) return null;

  return (
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
            <span className="ml-2 shrink-0 tabular-nums font-medium">
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
                <span className="capitalize text-muted-foreground">
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
  );
}
