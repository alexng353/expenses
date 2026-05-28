import { useCallback } from "react";
import { Checkbox } from "@workspace/ui/components/checkbox";
export const DEFAULT_FILTERS = {
    missingReceipt: true,
    missingNotes: false,
    missingMotion: false,
    missingCategory: false,
};
export function ExpenseFilters({ filters, onFiltersChange, grantMode, }) {
    const toggle = useCallback((key) => {
        onFiltersChange({ ...filters, [key]: !filters[key] });
    }, [filters, onFiltersChange]);
    const anyActive = filters.missingReceipt ||
        filters.missingNotes ||
        filters.missingMotion ||
        filters.missingCategory;
    return (<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="text-sm font-medium text-muted-foreground">
        Needs more info:
      </span>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={filters.missingReceipt} onCheckedChange={() => toggle("missingReceipt")}/>
        Missing Receipt
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={filters.missingNotes} onCheckedChange={() => toggle("missingNotes")}/>
        Missing Notes
      </label>

      {grantMode && (<>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={filters.missingMotion} onCheckedChange={() => toggle("missingMotion")}/>
            Missing Motion #
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={filters.missingCategory} onCheckedChange={() => toggle("missingCategory")}/>
            Missing Category
          </label>
        </>)}

      {anyActive && (<button className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => onFiltersChange({
                missingReceipt: false,
                missingNotes: false,
                missingMotion: false,
                missingCategory: false,
            })}>
          Clear all
        </button>)}
    </div>);
}
/** Build a filter function from the current filter state (OR logic). */
export function buildFilterFn(filters) {
    const checks = [];
    if (filters.missingReceipt)
        checks.push((e) => e.receiptCount === 0);
    if (filters.missingNotes)
        checks.push((e) => !e.notes);
    if (filters.missingMotion)
        checks.push((e) => e.motionNumber == null);
    if (filters.missingCategory)
        checks.push((e) => !e.grantCategoryId);
    if (checks.length === 0)
        return undefined;
    return (expense) => checks.some((check) => check(expense));
}
