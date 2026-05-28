import { useState, useCallback } from "react";
import { Input } from "@workspace/ui/components/input";
export function CurrencyInput({ value, onChange, placeholder = "$0.00", className, autoFocus, onBlur, onKeyDown, }) {
    const [displayValue, setDisplayValue] = useState(() => value != null ? (value / 100).toFixed(2) : "");
    const handleChange = useCallback((e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        // Prevent multiple dots
        const parts = raw.split(".");
        const sanitized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : raw;
        setDisplayValue(sanitized);
        if (sanitized === "" || sanitized === ".") {
            onChange(null);
            return;
        }
        const num = parseFloat(sanitized);
        if (!isNaN(num)) {
            onChange(Math.round(num * 100));
        }
    }, [onChange]);
    const handleBlur = useCallback(() => {
        // Format on blur
        if (displayValue && displayValue !== ".") {
            const num = parseFloat(displayValue);
            if (!isNaN(num)) {
                setDisplayValue(num.toFixed(2));
            }
        }
        onBlur?.();
    }, [displayValue, onBlur]);
    return (<div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input type="text" inputMode="decimal" value={displayValue} onChange={handleChange} onBlur={handleBlur} onKeyDown={onKeyDown} placeholder={placeholder} className={`pl-6 ${className ?? ""}`} autoFocus={autoFocus}/>
    </div>);
}
