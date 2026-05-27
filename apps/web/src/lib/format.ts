export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

export function parseCurrencyInput(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-CA");
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    awaiting_approval: "Awaiting Approval",
    approved: "Approved",
    outstanding: "Outstanding",
    paid: "Paid",
    reimbursed: "Reimbursed",
  };
  return labels[status] ?? status;
}

export function statusColor(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  const colors: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    awaiting_approval: "outline",
    approved: "secondary",
    outstanding: "destructive",
    paid: "default",
    reimbursed: "default",
  };
  return colors[status] ?? "outline";
}
