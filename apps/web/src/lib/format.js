export function formatCurrency(cents) {
    return new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
    }).format(cents / 100);
}
export function parseCurrencyInput(value) {
    const cleaned = value.replace(/[$,\s]/g, "");
    const num = parseFloat(cleaned);
    if (isNaN(num))
        return null;
    return Math.round(num * 100);
}
export function formatDate(dateStr) {
    if (!dateStr)
        return "";
    return new Date(dateStr).toLocaleDateString("en-CA");
}
export function statusLabel(status) {
    const labels = {
        awaiting_approval: "Awaiting Approval",
        approved: "Approved",
        outstanding: "Outstanding",
        paid: "Paid",
        reimbursed: "Reimbursed",
    };
    return labels[status] ?? status;
}
export function statusColor(status) {
    const colors = {
        awaiting_approval: "outline",
        approved: "secondary",
        outstanding: "destructive",
        paid: "default",
        reimbursed: "default",
    };
    return colors[status] ?? "outline";
}
