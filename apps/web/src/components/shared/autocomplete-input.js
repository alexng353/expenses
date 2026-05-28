import { useId } from "react";
import { Input } from "@workspace/ui/components/input";
export function AutocompleteInput({ value, onChange, suggestions, placeholder, className, autoFocus, onBlur, onKeyDown, }) {
    const listId = useId();
    return (<>
      <Input type="text" list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={className} autoFocus={autoFocus} onBlur={onBlur} onKeyDown={onKeyDown}/>
      <datalist id={listId}>
        {suggestions.map((s) => (<option key={s} value={s}/>))}
      </datalist>
    </>);
}
