"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Renders a PDF's pages to <canvas> images inside a scrollable area — i.e. an
 * "image only" viewer with no browser PDF chrome (no print/download toolbar,
 * unlike embedding the file in an <iframe>). Uses pdf.js, loaded lazily on the
 * client so it never runs during SSR.
 */
export function PdfPagesViewer({ src }: { src: string }) {
  const t = useTranslations("progress");
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setStatus("loading");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const res = await fetch(src);
        if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`);
        const data = await res.arrayBuffer();

        const doc = await pdfjs.getDocument({ data }).promise;
        const container = containerRef.current;
        if (!container || cancelled) return;

        const width = container.clientWidth || 300;
        container.replaceChildren();

        for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
          if (cancelled) return;
          const page = await doc.getPage(pageNo);
          const scale = width / page.getViewport({ scale: 1 }).width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.className = "block";

          await page.render({
            canvas,
            viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          }).promise;

          if (cancelled) return;
          container.appendChild(canvas);
        }
        if (!cancelled) setStatus("ready");
      } catch (error) {
        console.error("Failed to render PDF preview:", error);
        if (!cancelled) setStatus("error");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className="relative h-[52vh] overflow-y-auto rounded-xl border border-border bg-surface-2 p-2">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-[36px] w-[36px] animate-spin rounded-full border-[3px] border-surface border-t-primary" />
        </div>
      )}
      {status === "error" && (
        <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-text-muted">
          {t("previewError")}
        </div>
      )}
      <div ref={containerRef} className="flex flex-col gap-2" />
    </div>
  );
}
