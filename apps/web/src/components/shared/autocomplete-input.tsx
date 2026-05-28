import { useId } from "react"
import { Input } from "@workspace/ui/components/input"

interface AutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent) => void
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  autoFocus,
  onBlur,
  onKeyDown,
}: AutocompleteInputProps) {
  const listId = useId()

  return (
    <>
      <Input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        autoFocus={autoFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  )
}
