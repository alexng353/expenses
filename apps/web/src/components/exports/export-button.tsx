import { useState } from "react";
import { useEvent } from "../../hooks/use-event";
import { Button } from "@workspace/ui/components/button";
import { Download } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8888/api";

export function ExportButton() {
  const { currentEvent } = useEvent();
  const [loading, setLoading] = useState(false);

  if (!currentEvent) return null;

  const handleExport = async () => {
    setLoading(true);
    try {
      const url = `${API_BASE}/events/${currentEvent.id}/export/xlsx`;
      const res = await fetch(url, { credentials: "include" });

      if (!res.ok) {
        throw new Error("Export failed");
      }

      const blob = await res.blob();
      const a = document.createElement("a");
      const safeName = currentEvent.name.replace(/[^a-zA-Z0-9]/g, "_");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}_export.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={loading}
    >
      <Download className="mr-1.5 size-4" />
      {loading ? "Exporting..." : "Export XLSX"}
    </Button>
  );
}
