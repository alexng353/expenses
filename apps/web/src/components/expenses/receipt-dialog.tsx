import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { api } from "../../lib/api"
import type { Expense, ExpenseReceipt } from "../../lib/types"
import {
  useUploadReceipt,
  useReceiptTagAutocomplete,
} from "../../hooks/use-expenses"
import { useEvent } from "../../hooks/use-event"
import { AutocompleteInput } from "../shared/autocomplete-input"
import { FileText, Download, Upload, Trash2 } from "lucide-react"

interface ReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense: Expense | null
}

export function ReceiptDialog({
  open,
  onOpenChange,
  expense,
}: ReceiptDialogProps) {
  const { currentEvent } = useEvent()
  const eventId = currentEvent?.id

  const { data: receipts = [], refetch } = useQuery({
    queryKey: ["events", eventId, "expenses", expense?.id, "receipts"],
    queryFn: () =>
      api<ExpenseReceipt[]>(
        `/events/${eventId}/expenses/${expense!.id}/receipts`
      ),
    enabled: !!eventId && !!expense?.id && open,
  })

  const uploadReceipt = useUploadReceipt()
  const { data: tagSuggestions = [] } = useReceiptTagAutocomplete()

  const [uploading, setUploading] = useState(false)
  const [tag, setTag] = useState("")

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || !expense) return
      setUploading(true)
      try {
        for (const file of Array.from(files)) {
          await uploadReceipt.mutateAsync({
            expenseId: expense.id,
            file,
            tag: tag || undefined,
          })
        }
        setTag("")
        await refetch()
      } finally {
        setUploading(false)
      }
    },
    [expense, uploadReceipt, tag, refetch]
  )

  const handleDelete = useCallback(
    async (receiptId: string) => {
      if (!expense || !eventId) return
      await api(
        `/events/${eventId}/expenses/${expense.id}/receipts/${receiptId}`,
        { method: "DELETE" }
      )
      await refetch()
    },
    [expense, eventId, refetch]
  )

  const handleViewReceipt = useCallback(
    async (receipt: ExpenseReceipt) => {
      if (!expense || !eventId) return
      try {
        const { url } = await api<{ url: string }>(
          `/events/${eventId}/expenses/${expense.id}/receipts/${receipt.id}/url`
        )
        window.open(url, "_blank")
      } catch {
        // Fallback: try direct download
        window.open(
          `${import.meta.env.VITE_API_URL ?? "http://localhost:8888/api"}/events/${eventId}/expenses/${expense.id}/receipts/${receipt.id}/download`,
          "_blank"
        )
      }
    },
    [expense, eventId]
  )

  if (!expense) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receipts for {expense.name}</DialogTitle>
        </DialogHeader>

        {/* Existing receipts */}
        <div className="space-y-2">
          {receipts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No receipts uploaded yet.
            </p>
          ) : (
            receipts.map((receipt) => (
              <div
                key={receipt.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {receipt.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(receipt.fileSize)}
                    {receipt.tag && <> &middot; {receipt.tag}</>} &middot;{" "}
                    {new Date(receipt.createdAt).toLocaleDateString("en-CA")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleViewReceipt(receipt)}
                    title="View / Download"
                  >
                    <Download className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(receipt.id)}
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Upload section */}
        <div className="space-y-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-4">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Upload Receipt</span>
          </div>
          <div className="space-y-2">
            <AutocompleteInput
              value={tag}
              onChange={setTag}
              suggestions={tagSuggestions}
              placeholder="Tag (optional)"
            />
            <div>
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => handleUpload(e.target.files)}
                className="hidden"
                id="receipt-dialog-upload"
                disabled={uploading}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={uploading}
                render={<label htmlFor="receipt-dialog-upload" />}
              >
                {uploading ? "Uploading..." : "Choose Files"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
