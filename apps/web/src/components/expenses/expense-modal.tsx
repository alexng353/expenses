import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { CurrencyInput } from "../shared/currency-input";
import { AutocompleteInput } from "../shared/autocomplete-input";
import type {
  Expense,
  EventMember,
  EventBucket,
  GrantCategory,
  ExpenseStatus,
} from "../../lib/types";
import {
  useCreateExpense,
  useUpdateExpense,
  useUploadReceipt,
  usePlaceAutocomplete,
} from "../../hooks/use-expenses";

interface ExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
  members: EventMember[];
  buckets: EventBucket[];
  grantCategories: GrantCategory[];
  grantMode: boolean;
}

interface FormState {
  name: string;
  amountCents: number | null;
  date: string;
  placeOfPurchase: string;
  status: ExpenseStatus;
  bucketId: string;
  paidById: string;
  notes: string;
  motionNumber: string;
  grantCategoryId: string;
  grantSubLabel: string;
}

function getInitialState(expense?: Expense | null): FormState {
  return {
    name: expense?.name ?? "",
    amountCents: expense?.amountCents ?? null,
    date: expense?.date ?? "",
    placeOfPurchase: expense?.placeOfPurchase ?? "",
    status: expense?.status ?? "outstanding",
    bucketId: expense?.bucketId ?? "",
    paidById: expense?.paidById ?? "",
    notes: expense?.notes ?? "",
    motionNumber: expense?.motionNumber?.toString() ?? "",
    grantCategoryId: expense?.grantCategoryId ?? "",
    grantSubLabel: expense?.grantSubLabel ?? "",
  };
}

export function ExpenseModal({
  open,
  onOpenChange,
  expense,
  members,
  buckets,
  grantCategories,
  grantMode,
}: ExpenseModalProps) {
  const [form, setForm] = useState<FormState>(() => getInitialState(expense));
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [error, setError] = useState("");

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const uploadReceipt = useUploadReceipt();
  const { data: placeSuggestions = [] } = usePlaceAutocomplete();

  const isEditing = !!expense?.id;

  // Reset form when dialog opens with new expense data
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setForm(getInitialState(expense));
        setReceiptFiles([]);
        setError("");
      }
      onOpenChange(nextOpen);
    },
    [expense, onOpenChange]
  );

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!form.name.trim()) {
        setError("Name is required");
        return;
      }
      if (form.amountCents == null || form.amountCents <= 0) {
        setError("Amount must be greater than 0");
        return;
      }

      const payload = {
        name: form.name.trim(),
        amountCents: form.amountCents,
        date: form.date || null,
        placeOfPurchase: form.placeOfPurchase || null,
        status: form.status,
        bucketId: form.bucketId || null,
        paidById: form.paidById || null,
        notes: form.notes || null,
        motionNumber: form.motionNumber
          ? parseInt(form.motionNumber, 10)
          : null,
        grantCategoryId: form.grantCategoryId || null,
        grantSubLabel: form.grantSubLabel || null,
      };

      try {
        if (isEditing) {
          await updateExpense.mutateAsync({
            id: expense.id,
            ...payload,
          });
        } else {
          const created = await createExpense.mutateAsync(payload);

          // Upload receipts for new expense
          for (const file of receiptFiles) {
            await uploadReceipt.mutateAsync({
              expenseId: created.id,
              file,
            });
          }
        }

        onOpenChange(false);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to save expense"
        );
      }
    },
    [
      form,
      isEditing,
      expense,
      updateExpense,
      createExpense,
      uploadReceipt,
      receiptFiles,
      onOpenChange,
    ]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        setReceiptFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
      }
    },
    []
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Expense" : "Add Expense"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="expense-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="expense-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Expense name"
              autoFocus
            />
          </div>

          {/* Amount + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Amount <span className="text-destructive">*</span>
              </Label>
              <CurrencyInput
                value={form.amountCents}
                onChange={(cents) => setField("amountCents", cents)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                id="expense-date"
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
              />
            </div>
          </div>

          {/* Status + Paid By row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="expense-status">Status</Label>
              <select
                id="expense-status"
                value={form.status}
                onChange={(e) =>
                  setField("status", e.target.value as ExpenseStatus)
                }
                className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
              >
                <option value="outstanding">Outstanding</option>
                <option value="awaiting_approval">Awaiting Approval</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="reimbursed">Reimbursed</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-paid-by">Paid By</Label>
              <select
                id="expense-paid-by"
                value={form.paidById}
                onChange={(e) => setField("paidById", e.target.value)}
                className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.userName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bucket */}
          <div className="space-y-1.5">
            <Label htmlFor="expense-bucket">Bucket</Label>
            <select
              id="expense-bucket"
              value={form.bucketId}
              onChange={(e) => setField("bucketId", e.target.value)}
              className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
            >
              <option value="">No bucket</option>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Place of Purchase */}
          <div className="space-y-1.5">
            <Label>Place of Purchase</Label>
            <AutocompleteInput
              value={form.placeOfPurchase}
              onChange={(v) => setField("placeOfPurchase", v)}
              suggestions={placeSuggestions}
              placeholder="Where was this purchased?"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="expense-notes">Notes</Label>
            <Textarea
              id="expense-notes"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>

          {/* Grant Mode fields */}
          {grantMode && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="expense-motion">Motion Number</Label>
                  <Input
                    id="expense-motion"
                    type="number"
                    value={form.motionNumber}
                    onChange={(e) => setField("motionNumber", e.target.value)}
                    placeholder="#"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expense-grant-cat">Grant Category</Label>
                  <select
                    id="expense-grant-cat"
                    value={form.grantCategoryId}
                    onChange={(e) =>
                      setField("grantCategoryId", e.target.value)
                    }
                    className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                  >
                    <option value="">None</option>
                    {grantCategories.map((gc) => (
                      <option key={gc.id} value={gc.id}>
                        {gc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-grant-sub">Grant Sub-Label</Label>
                <Input
                  id="expense-grant-sub"
                  value={form.grantSubLabel}
                  onChange={(e) => setField("grantSubLabel", e.target.value)}
                  placeholder="Sub-label"
                />
              </div>
            </>
          )}

          {/* Receipt upload (only for new expenses) */}
          {!isEditing && (
            <div className="space-y-1.5">
              <Label>Receipts</Label>
              <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 text-center">
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="receipt-upload"
                />
                <label
                  htmlFor="receipt-upload"
                  className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
                >
                  Click to upload receipts
                </label>
                {receiptFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {receiptFiles.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          className="ml-2 text-destructive hover:underline"
                          onClick={() =>
                            setReceiptFiles((prev) =>
                              prev.filter((_, j) => j !== i)
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createExpense.isPending || updateExpense.isPending}
            >
              {createExpense.isPending || updateExpense.isPending
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Add Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
