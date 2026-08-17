"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type PdfExportButtonProps = {
  targetId: string;
  filename: string;
  label?: string;
  className?: string;
};

export function PdfExportButton({
  targetId,
  filename,
  label = "Export PDF",
  className,
}: PdfExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    const target = document.getElementById(targetId);
    if (!target) {
      toast.error("Report content not found");
      return;
    }

    try {
      setExporting(true);
      const html2pdf = (await import("html2pdf.js")).default;

      const options = {
          margin: 10,
          filename,
          image: { type: "jpeg" as const, quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "landscape" as const },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        };

      await html2pdf()
        .set(options)
        .from(target)
        .save();
    } catch (error: any) {
      toast.error(error?.message || "Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleExport}
      disabled={exporting}
      className={className}
    >
      <Download className="mr-2 h-4 w-4" />
      {exporting ? "Exporting..." : label}
    </Button>
  );
}
