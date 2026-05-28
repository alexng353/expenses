import { Badge } from "@workspace/ui/components/badge";
import { statusLabel } from "../../lib/format";
const STATUS_STYLES = {
    outstanding: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
    paid: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900",
    reimbursed: "bg-green-50 text-green-600 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-900/50",
    approved: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
    awaiting_approval: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-900",
};
export function StatusBadge({ status, className }) {
    return (<Badge variant="outline" className={`${STATUS_STYLES[status]} ${className ?? ""}`}>
      {statusLabel(status)}
    </Badge>);
}
