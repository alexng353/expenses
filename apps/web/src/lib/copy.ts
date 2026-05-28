import { toBlob } from "html-to-image"
import { formatCurrency } from "./format"
import type {
  Expense,
  EventMember,
  EventBucket,
  EventSummary,
} from "./types"

/**
 * Format a list of expenses as markdown list items.
 *
 * Each line looks like:
 *   `- Name (Bucket) --- Amount, paid by: <name>, <notes>`
 *
 * The `(Bucket)` segment is omitted entirely when the expense has no bucket,
 * and the `, <notes>` segment is omitted when there are no notes.
 */
export function formatExpensesMarkdown(
  expenses: Expense[],
  members: EventMember[],
  buckets: EventBucket[]
): string {
  return expenses
    .map((expense) => {
      const bucket = buckets.find((b) => b.id === expense.bucketId)
      const bucketPart = bucket ? ` (${bucket.name})` : ""

      const member = members.find((m) => m.userId === expense.paidById)
      const paidByName = member?.userName ?? "Unassigned"

      const amount = formatCurrency(expense.amountCents)
      const notesPart = expense.notes ? `, ${expense.notes}` : ""

      return `- ${expense.name}${bucketPart} --- ${amount}, paid by: ${paidByName}${notesPart}`
    })
    .join("\n")
}

/**
 * Format an event summary as a markdown table of bucket totals plus a grand
 * total row.
 */
export function formatSummaryMarkdown(
  summary: EventSummary,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _buckets: EventBucket[] = []
): string {
  const lines = ["| Bucket | Total |", "|---|---|"]
  for (const bucket of summary.byBucket) {
    lines.push(`| ${bucket.bucketName} | ${formatCurrency(bucket.totalCents)} |`)
  }
  lines.push(`| **Total** | **${formatCurrency(summary.totalCents)}** |`)
  return lines.join("\n")
}

/**
 * Format an event summary as aligned plaintext columns (no markdown pipes).
 * Bucket names are left-aligned and amounts are right-aligned.
 */
export function formatSummaryPlaintext(
  summary: EventSummary,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _buckets: EventBucket[] = []
): string {
  const rows: { label: string; amount: string }[] = summary.byBucket.map(
    (bucket) => ({
      label: bucket.bucketName,
      amount: formatCurrency(bucket.totalCents),
    })
  )
  rows.push({ label: "Total", amount: formatCurrency(summary.totalCents) })

  const labelWidth = Math.max(...rows.map((r) => r.label.length), 0)
  const amountWidth = Math.max(...rows.map((r) => r.amount.length), 0)

  return rows
    .map(
      (r) => `${r.label.padEnd(labelWidth)}  ${r.amount.padStart(amountWidth)}`
    )
    .join("\n")
}

/** Copy plain text to the clipboard. */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/** Render a DOM node to a PNG and copy it to the clipboard. */
export async function copyPng(node: HTMLElement): Promise<void> {
  const blob = await toBlob(node)
  if (!blob) throw new Error("Failed to render node to PNG")
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ])
}
