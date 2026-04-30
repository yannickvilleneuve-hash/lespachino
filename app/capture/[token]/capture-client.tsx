"use client";

import { useEffect, useRef, useState } from "react";
import { uploadPhotoBySession } from "@/lib/photo-sessions/actions";

interface UploadItem {
  id: string;
  status: "uploading" | "ok" | "error";
  preview: string;
  error?: string;
  thumb_url?: string;
}

const MAX_DIM = 2048;
const JPEG_QUALITY = 0.85;

/** Redimensionne + ré-encode JPEG avant upload pour économiser bandwidth.
 *  Garde le ratio. Photos iPhone HEIC/HEIF deviennent JPEG ici. */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob null"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

function fmtTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CaptureClient({
  token,
  unit,
  vehicleLabel,
  expiresAt,
  remainingUploads,
}: {
  token: string;
  unit: string;
  vehicleLabel: string;
  expiresAt: string;
  remainingUploads: number;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [remaining, setRemaining] = useState(remainingUploads);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const exp = new Date(expiresAt).getTime();
    const tick = () => setTimeLeft(exp - Date.now());
    const id = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(t);
    };
  }, [expiresAt]);

  async function processFile(file: File): Promise<void> {
    const id = crypto.randomUUID();
    const preview = URL.createObjectURL(file);
    setItems((prev) => [...prev, { id, status: "uploading", preview }]);
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append("file", new File([compressed], `${id}.jpg`, { type: "image/jpeg" }));
      const res = await uploadPhotoBySession(token, fd);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? res.ok
              ? { ...it, status: "ok", thumb_url: res.url_thumb }
              : { ...it, status: "error", error: res.error }
            : it,
        ),
      );
      if (res.ok) setRemaining((r) => Math.max(0, r - 1));
    } catch (e) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, status: "error", error: (e as Error).message }
            : it,
        ),
      );
    }
  }

  function onFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(processFile);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const okCount = items.filter((i) => i.status === "ok").length;
  const uploadingCount = items.filter((i) => i.status === "uploading").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const expired = timeLeft <= 0;
  const exhausted = remaining <= 0;

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <header className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-400 uppercase tracking-wide">
            Photo · {unit}
          </div>
          <div className="text-sm font-medium truncate">{vehicleLabel}</div>
        </div>
        <div className="text-right text-xs">
          <div className={timeLeft < 60_000 ? "text-amber-400" : "text-gray-400"}>
            {expired ? "Expirée" : fmtTime(timeLeft)}
          </div>
          <div className="text-gray-500">{remaining} restantes</div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <button
          type="button"
          disabled={expired || exhausted}
          onClick={() => fileInputRef.current?.click()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:opacity-50 text-white py-6 rounded-xl text-lg font-semibold flex items-center justify-center gap-2 shadow-lg"
        >
          <span className="text-3xl">📷</span>
          Prendre une photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />

        <button
          type="button"
          disabled={expired || exhausted}
          onClick={() => {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "image/*";
            inp.multiple = true;
            inp.onchange = () => onFiles(inp.files);
            inp.click();
          }}
          className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-3 rounded-lg text-sm font-medium"
        >
          📁 Choisir depuis la galerie
        </button>

        {(uploadingCount > 0 || okCount > 0 || errorCount > 0) && (
          <div className="bg-gray-800 rounded p-3 text-xs flex gap-4">
            {uploadingCount > 0 && (
              <span className="text-amber-400">⏳ {uploadingCount} en cours</span>
            )}
            <span className="text-emerald-400">✅ {okCount} envoyées</span>
            {errorCount > 0 && (
              <span className="text-red-400">⚠ {errorCount} erreurs</span>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {items
              .slice()
              .reverse()
              .map((it) => (
                <div
                  key={it.id}
                  className="relative aspect-square bg-gray-800 rounded overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.preview}
                    alt=""
                    className={
                      "w-full h-full object-cover " +
                      (it.status === "uploading" ? "opacity-50 blur-[1px]" : "")
                    }
                  />
                  {it.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center text-2xl">
                      ⏳
                    </div>
                  )}
                  {it.status === "ok" && (
                    <div className="absolute top-1 right-1 bg-emerald-600 rounded-full w-5 h-5 flex items-center justify-center text-[12px]">
                      ✓
                    </div>
                  )}
                  {it.status === "error" && (
                    <div
                      className="absolute inset-0 bg-red-900/80 flex items-center justify-center text-xs p-2 text-center"
                      title={it.error}
                    >
                      ⚠ {it.error?.slice(0, 40)}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        <p className="text-xs text-gray-500 text-center pt-4">
          Lien expire à <span className="font-mono">{new Date(expiresAt).toLocaleTimeString("fr-CA")}</span>.
          Les photos arrivent automatiquement sur la fiche dans le dashboard.
        </p>
      </div>
    </main>
  );
}
