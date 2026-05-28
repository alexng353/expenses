import { useEffect } from "react"
import { createPortal } from "react-dom"

export interface RowMenuItem {
  label: string
  onClick: () => void
  variant?: "default" | "destructive"
}

interface RowContextMenuProps {
  x: number
  y: number
  items: RowMenuItem[]
  onClose: () => void
}

export function RowContextMenu({ x, y, items, onClose }: RowContextMenuProps) {
  useEffect(() => {
    const handler = () => onClose()
    document.addEventListener("click", handler)
    document.addEventListener("contextmenu", handler)
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("click", handler)
      document.removeEventListener("contextmenu", handler)
      document.removeEventListener("keydown", esc)
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className={`flex w-full items-center rounded-md px-2 py-1 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground ${
            item.variant === "destructive"
              ? "text-destructive hover:text-destructive"
              : ""
          }`}
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}
