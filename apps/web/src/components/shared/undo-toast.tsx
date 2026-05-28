import { Button } from "@workspace/ui/components/button";
import { Undo2 } from "lucide-react";

interface UndoToastProps {
  expenseName: string;
  field: string;
  onUndo: () => void;
  onDismiss: () => void;
  stackSize: number;
}

export function UndoToast({
  expenseName,
  field,
  onUndo,
  onDismiss,
  stackSize,
}: UndoToastProps) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-4">
      <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 shadow-lg">
        <span className="text-sm">
          Updated <strong>{expenseName}</strong> {field}
        </span>
        <Button variant="ghost" size="sm" onClick={onUndo}>
          <Undo2 className="mr-1 size-3.5" />
          Undo{stackSize > 1 ? ` (${stackSize})` : ""}
        </Button>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ×
        </button>
      </div>
    </div>
  );
}
