import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, } from "@workspace/ui/components/context-menu";
import { Pencil, Copy, ArrowRightLeft, User, Paperclip, Upload, Trash2, } from "lucide-react";
const STATUSES = [
    { value: "outstanding", label: "Outstanding" },
    { value: "awaiting_approval", label: "Awaiting Approval" },
    { value: "approved", label: "Approved" },
    { value: "paid", label: "Paid" },
    { value: "reimbursed", label: "Reimbursed" },
];
export function ExpenseContextMenu({ children, expense, members, onEdit, onDuplicate, onStatusChange, onPaidByChange, onViewReceipts, onDelete, }) {
    return (<ContextMenu>
      <ContextMenuTrigger className="contents">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={onEdit}>
          <Pencil className="mr-2 size-4"/>
          Edit
        </ContextMenuItem>
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 size-4"/>
          Duplicate
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Change Status submenu */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <ArrowRightLeft className="mr-2 size-4"/>
            Change Status
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {STATUSES.map((s) => (<ContextMenuItem key={s.value} onClick={() => onStatusChange(s.value)} className={expense.status === s.value ? "font-semibold" : ""}>
                {s.label}
                {expense.status === s.value && (<span className="ml-auto text-xs text-muted-foreground">
                    current
                  </span>)}
              </ContextMenuItem>))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/* Change Paid By submenu */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <User className="mr-2 size-4"/>
            Change Paid By
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onPaidByChange(null)} className={!expense.paidById ? "font-semibold" : ""}>
              Unassigned
            </ContextMenuItem>
            {members.map((m) => (<ContextMenuItem key={m.userId} onClick={() => onPaidByChange(m.userId)} className={expense.paidById === m.userId ? "font-semibold" : ""}>
                {m.userName}
                {expense.paidById === m.userId && (<span className="ml-auto text-xs text-muted-foreground">
                    current
                  </span>)}
              </ContextMenuItem>))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={onViewReceipts}>
          <Paperclip className="mr-2 size-4"/>
          View Receipts ({expense.receiptCount})
        </ContextMenuItem>
        <ContextMenuItem onClick={onViewReceipts}>
          <Upload className="mr-2 size-4"/>
          Upload Receipt
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="mr-2 size-4"/>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>);
}
