import { useState, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { CurrencyInput } from "../shared/currency-input";
import { AutocompleteInput } from "../shared/autocomplete-input";
import { useCreateExpense, useUpdateExpense, useUploadReceipt, usePlaceAutocomplete, } from "../../hooks/use-expenses";
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}
function dateRelativeLabel(dateStr) {
    if (!dateStr)
        return "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0)
        return "today";
    if (diff === -1)
        return "yesterday";
    if (diff === 1)
        return "tomorrow";
    return "";
}
function formatDateDisplay(dateStr) {
    if (!dateStr)
        return "";
    const [y, m, d] = dateStr.split("-");
    const formatted = `${d}/${m}/${y.slice(2)}`;
    const rel = dateRelativeLabel(dateStr);
    return rel ? `${formatted} (${rel})` : formatted;
}
function getInitialState(expense, currentUserId) {
    return {
        name: expense?.name ?? "",
        amountCents: expense?.amountCents ?? null,
        date: expense?.date ?? todayStr(),
        placeOfPurchase: expense?.placeOfPurchase ?? "",
        status: expense?.status ?? "outstanding",
        bucketId: expense?.bucketId ?? "",
        paidById: expense?.paidById ?? currentUserId ?? "",
        notes: expense?.notes ?? "",
        grantCategoryId: expense?.grantCategoryId ?? "",
        grantSubLabel: expense?.grantSubLabel ?? "",
    };
}
export function ExpenseModal({ open, onOpenChange, expense, members, buckets, grantCategories, grantMode, currentUserId, }) {
    const [form, setForm] = useState(() => getInitialState(expense, currentUserId));
    const [receiptFiles, setReceiptFiles] = useState([]);
    const [error, setError] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);
    const createExpense = useCreateExpense();
    const updateExpense = useUpdateExpense();
    const uploadReceipt = useUploadReceipt();
    const { data: placeSuggestions = [] } = usePlaceAutocomplete();
    const isEditing = !!expense?.id;
    const handleOpenChange = useCallback((nextOpen) => {
        if (nextOpen) {
            setForm(getInitialState(expense, currentUserId));
            setReceiptFiles([]);
            setError("");
            setIsDragging(false);
        }
        onOpenChange(nextOpen);
    }, [expense, onOpenChange]);
    const setField = useCallback((key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    }, []);
    const handleSubmit = useCallback(async (e) => {
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
            grantCategoryId: form.grantCategoryId || null,
            grantSubLabel: form.grantSubLabel || null,
        };
        try {
            if (isEditing) {
                await updateExpense.mutateAsync({
                    id: expense.id,
                    ...payload,
                });
            }
            else {
                const created = await createExpense.mutateAsync(payload);
                for (const file of receiptFiles) {
                    await uploadReceipt.mutateAsync({
                        expenseId: created.id,
                        file,
                    });
                }
            }
            onOpenChange(false);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save expense");
        }
    }, [
        form,
        isEditing,
        expense,
        updateExpense,
        createExpense,
        uploadReceipt,
        receiptFiles,
        onOpenChange,
    ]);
    const addFiles = useCallback((files) => {
        setReceiptFiles((prev) => [...prev, ...Array.from(files)]);
    }, []);
    const handleFileChange = useCallback((e) => {
        if (e.target.files)
            addFiles(e.target.files);
    }, [addFiles]);
    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0)
            addFiles(e.dataTransfer.files);
    }, [addFiles]);
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);
    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);
    return (<Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Expense" : "Add Expense"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Place of Purchase */}
          <div className="space-y-1.5">
            <Label>Place of Purchase</Label>
            <AutocompleteInput value={form.placeOfPurchase} onChange={(v) => setField("placeOfPurchase", v)} suggestions={placeSuggestions} placeholder="Where was this purchased?"/>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="expense-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="expense-name" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Expense name" autoFocus/>
          </div>

          {/* Amount + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Amount <span className="text-destructive">*</span>
              </Label>
              <CurrencyInput value={form.amountCents} onChange={(cents) => setField("amountCents", cents)}/>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-date">
                Date
                {form.date && (<span className="font-normal text-muted-foreground">
                    {" "}
                    {formatDateDisplay(form.date)}
                  </span>)}
              </Label>
              <Input id="expense-date" type="date" value={form.date} onChange={(e) => setField("date", e.target.value)}/>
            </div>
          </div>

          {/* Status + Paid By row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="expense-status">Status</Label>
              <select id="expense-status" value={form.status} onChange={(e) => setField("status", e.target.value)} className="h-9 w-full appearance-none rounded-lg border border-input bg-background px-2.5 py-0 text-sm leading-9 outline-none focus:border-ring focus:ring-3 focus:ring-ring/50">
                <option value="outstanding">Outstanding</option>
                <option value="awaiting_approval">Awaiting Approval</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="reimbursed">Reimbursed</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-paid-by">Paid By</Label>
              <select id="expense-paid-by" value={form.paidById} onChange={(e) => setField("paidById", e.target.value)} className="h-9 w-full appearance-none rounded-lg border border-input bg-background px-2.5 py-0 text-sm leading-9 outline-none focus:border-ring focus:ring-3 focus:ring-ring/50">
                <option value="">Unassigned</option>
                {members.map((m) => (<option key={m.userId} value={m.userId}>
                    {m.userName}
                  </option>))}
              </select>
            </div>
          </div>

          {/* Bucket */}
          <div className="space-y-1.5">
            <Label htmlFor="expense-bucket">Bucket</Label>
            <select id="expense-bucket" value={form.bucketId} onChange={(e) => {
            const id = e.target.value;
            setField("bucketId", id);
            const bucket = buckets.find((b) => b.id === id);
            if (bucket)
                setField("grantSubLabel", bucket.name.toUpperCase());
            else
                setField("grantSubLabel", "");
        }} className="h-9 w-full appearance-none rounded-lg border border-input bg-background px-2.5 py-0 text-sm leading-9 outline-none focus:border-ring focus:ring-3 focus:ring-ring/50">
              <option value="">No bucket</option>
              {buckets.map((b) => (<option key={b.id} value={b.id}>
                  {b.name}
                </option>))}
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="expense-notes">Notes</Label>
            <Textarea id="expense-notes" value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Additional notes..." rows={2}/>
          </div>

          {/* Grant Mode: only category picker — sub-label auto-fills from bucket */}
          {grantMode && (<div className="space-y-1.5">
              <Label htmlFor="expense-grant-cat">Category</Label>
              <select id="expense-grant-cat" value={form.grantCategoryId} onChange={(e) => setField("grantCategoryId", e.target.value)} className="h-9 w-full appearance-none rounded-lg border border-input bg-background px-2.5 py-0 text-sm leading-9 outline-none focus:border-ring focus:ring-3 focus:ring-ring/50">
                <option value="">None</option>
                {grantCategories.map((gc) => (<option key={gc.id} value={gc.id}>
                    {gc.name}
                  </option>))}
              </select>
            </div>)}

          {/* Receipt upload (only for new expenses) */}
          {!isEditing && (<div className="space-y-1.5">
              <Label>Receipts</Label>
              <div role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()} onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                }
            }} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"}`}>
                <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" onChange={handleFileChange} className="hidden"/>
                <p className="text-sm text-muted-foreground">
                  {isDragging
                ? "Drop files here"
                : "Click or drag & drop to upload receipts"}
                </p>
                {receiptFiles.length > 0 && (<div className="mt-2 space-y-1">
                    {receiptFiles.map((f, i) => (<div key={i} className="flex items-center justify-between text-xs">
                        <span className="truncate">{f.name}</span>
                        <button type="button" className="ml-2 text-destructive hover:underline" onClick={(e) => {
                        e.stopPropagation();
                        setReceiptFiles((prev) => prev.filter((_, j) => j !== i));
                    }}>
                          Remove
                        </button>
                      </div>))}
                  </div>)}
              </div>
            </div>)}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createExpense.isPending || updateExpense.isPending}>
              {createExpense.isPending || updateExpense.isPending
            ? "Saving..."
            : isEditing
                ? "Save Changes"
                : "Add Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>);
}
