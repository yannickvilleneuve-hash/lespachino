"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

function normalizeVin(value: string): string {
  return value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17);
}

function looksLikeVin(value: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{6,17}$/.test(value);
}

export default function ScanVinClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [vin, setVin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(nextVin = vin) {
    const normalized = normalizeVin(nextVin);
    setVin(normalized);
    if (!looksLikeVin(normalized)) {
      setMsg("VIN trop court ou invalide.");
      return;
    }
    setBusy(true);
    setMsg("Recherche SERTI...");
    try {
      const response = await fetch(`/api/wgi/${encodeURIComponent(normalized)}`);
      if (!response.ok) {
        setMsg(response.status === 404 ? "Aucun véhicule trouvé." : "Erreur de recherche.");
        return;
      }
      const vehicle = (await response.json()) as { unit?: string };
      if (!vehicle.unit) {
        setMsg("Véhicule trouvé, mais unité absente.");
        return;
      }
      router.push(`/inventaire/${encodeURIComponent(vehicle.unit)}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur de recherche.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    if (!window.BarcodeDetector) {
      setMsg("Scan non supporté par ce navigateur. Entre le VIN manuellement.");
      return;
    }
    setBusy(true);
    setMsg("Lecture du code...");
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new window.BarcodeDetector({
        formats: ["code_39", "code_128", "qr_code", "data_matrix"],
      });
      const codes = await detector.detect(bitmap);
      const detected = codes.map((c) => normalizeVin(c.rawValue)).find(looksLikeVin);
      if (!detected) {
        setMsg("Aucun VIN lisible. Essaie de rapprocher la caméra ou entre le VIN.");
        return;
      }
      await lookup(detected);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Scan impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-xl p-6">
      <div className="bg-white border rounded p-5 space-y-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="w-full rounded bg-blue-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-50"
        >
          Scanner le VIN
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFile}
          className="hidden"
        />
        <div className="flex gap-2">
          <input
            value={vin}
            onChange={(e) => setVin(normalizeVin(e.target.value))}
            placeholder="VIN ou derniers caractères"
            className="min-w-0 flex-1 rounded border px-3 py-3 font-mono text-lg uppercase"
          />
          <button
            type="button"
            onClick={() => lookup()}
            disabled={busy}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Chercher
          </button>
        </div>
        {msg && <p className="text-sm text-gray-600">{msg}</p>}
      </div>
    </section>
  );
}
