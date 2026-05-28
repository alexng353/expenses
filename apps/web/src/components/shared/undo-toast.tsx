import { Button } from "@workspace/ui/components/button"
import { Undo2, Redo2 } from "lucide-react"

interface UndoToastProps {
  message: string
  onUndo: () => void
  onRedo: () => void
  onDismiss: () => void
  undoSize: number
  redoSize: number
}

export function UndoToast({
  message,
  onUndo,
  onRedo,
  onDismiss,
  undoSize,
  redoSize,
}: UndoToastProps) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-4">
      <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2.5 shadow-lg">
        <span className="text-sm">{message}</span>
        {undoSize > 0 && (
          <Button variant="ghost" size="sm" onClick={onUndo}>
            <Undo2 className="mr-1 size-3.5" />
            Undo
          </Button>
        )}
        {redoSize > 0 && (
          <Button variant="ghost" size="sm" onClick={onRedo}>
            <Redo2 className="mr-1 size-3.5" />
            Redo
          </Button>
        )}
        <button
          onClick={onDismiss}
          className="ml-1 text-lg leading-none text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      </div>
    </div>
  )
}
