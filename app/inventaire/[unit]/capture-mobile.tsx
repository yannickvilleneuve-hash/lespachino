"use client";

import { useState, useTransition, useEffect } from "react";
import QRCode from "qrcode";
import { createPhotoSession } from "@/lib/photo-sessions/actions";
import { useRouter } from "next/navigation";

interface SessionState {
  url: string;
  expires_at: string;
  qrDataUrl: string;
}

function fmt(ms: number): string {
  if (ms <= 0) return "expirée";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CaptureMobileButton({ unit }: { unit: string }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!session) return;
    const tick = () => setNow(Date.now());
    const id = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(t);
    };
  }, [session]);

  function onOpen() {
    setOpen(true);
    setErr(null);
    if (session) return;
    startTransition(async () => {
      try {
        const res = await createPhotoSession(unit);
        const qrDataUrl = await QRCode.toDataURL(res.url, {
          margin: 1,
          width: 280,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        setSession({ url: res.url, expires_at: res.expires_at, qrDataUrl });
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function onClose() {
    setOpen(false);
    router.refresh();
  }

  async function copyUrl() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.url);
    } catch {
      /* ignore */
    }
  }

  const remaining = session
    ? new Date(session.expires_at).getTime() - now
    : 0;
  const expired = remaining <= 0;

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="w-full bg-blue-700 hover:bg-blue-800 text-white py-2.5 px-4 rounded text-sm font-medium flex items-center justify-center gap-2"
      >
        📸 Capture mobile (QR)
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-1">Scanner avec le téléphone</h2>
            <p className="text-xs text-gray-500 mb-4">
              Ouvre l&apos;appareil photo de ton tél, vise le QR. La page de capture
              s&apos;ouvre déjà connectée à <code className="font-mono">{unit}</code>.
            </p>

            {pending && (
              <p className="text-sm text-gray-500 text-center py-12">
                Création du lien…
              </p>
            )}
            {err && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
                {err}
              </p>
            )}

            {session && !pending && (
              <>
                <div className="mx-auto mb-3 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={session.qrDataUrl}
                    alt={`QR pour ${unit}`}
                    width={280}
                    height={280}
                    className="rounded"
                  />
                </div>

                <div className="text-center mb-3">
                  <div
                    className={
                      "inline-block text-xs font-mono px-2 py-0.5 rounded " +
                      (expired
                        ? "bg-red-100 text-red-700"
                        : remaining < 60000
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800")
                    }
                  >
                    Expire dans {fmt(remaining)}
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={session.url}
                    readOnly
                    className="flex-1 border rounded px-2 py-1.5 text-xs font-mono bg-gray-50"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={copyUrl}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-xs"
                  >
                    Copier
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">
                  Tu peux aussi envoyer ce lien par texto au vendeur.
                </p>
              </>
            )}

            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
