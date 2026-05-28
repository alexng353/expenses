import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community"

// Register AG Grid community modules once at module load. Any table importing
// agTheme from here gets the modules registered as a side effect.
ModuleRegistry.registerModules([AllCommunityModule])

// Shared Quartz theme mapping shadcn CSS vars. Kept in sync with the config in
// components/expenses/expense-table.tsx.
export const agTheme = themeQuartz.withParams({
  backgroundColor: "var(--background)",
  foregroundColor: "var(--foreground)",
  headerBackgroundColor: "var(--background)",
  headerTextColor: "var(--foreground)",
  borderColor: "var(--border)",
  rowHoverColor: "var(--accent)",
  selectedRowBackgroundColor:
    "color-mix(in oklch, var(--primary) 15%, var(--background))",
  oddRowBackgroundColor: "var(--background)",
  headerFontSize: 13,
  fontSize: 13,
  rowBorder: true,
  columnBorder: false,
  wrapperBorder: false,
  wrapperBorderRadius: "0.5rem",
  spacing: 4,
  cellHorizontalPadding: 12,
})
