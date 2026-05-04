"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearWalkaroundVideo,
  uploadWalkaroundVideo,
  type UploadVideoResult,
} from "@/lib/listings/actions";

const VIDEO_ERROR_MSG: Record<Exclude<UploadVideoResult, { ok: true }>["error"], string> = {
  invalid_type: "Format non supporté. Utilise MP4, MOV ou WebM.",
  too_big: "Vidéo trop grosse (max 300 MB).",
  no_file: "Aucun fichier sélectionné.",
  missing_public_url: "NEXT_PUBLIC_SUPABASE_URL manquant.",
};

export default function WalkaroundVideo({
  unit,
  currentUrl,
}: {
  unit: string;
  currentUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setMsg(null);
    startTransition(async () => {
      const result = await uploadWalkaroundVideo(unit, fd);
      if (!result.ok) {
        setMsg(VIDEO_ERROR_MSG[result.error]);
        return;
      }
      setMsg("Vidéo ajoutée.");
      router.refresh();
    });
  }

  function onClear() {
    setMsg(null);
    startTransition(async () => {
      await clearWalkaroundVideo(unit);
      setMsg("Vidéo retirée.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {currentUrl ? (
        <video src={currentUrl} controls className="w-full max-h-[420px] rounded border bg-black" />
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded p-6 text-center text-sm text-gray-500">
          Aucune vidéo walkaround.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
          className="bg-blue-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
        >
          {currentUrl ? "Remplacer la vidéo" : "Ajouter une vidéo"}
        </button>
        {currentUrl && (
          <button
            type="button"
            onClick={onClear}
            disabled={isPending}
            className="border px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            Retirer
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/*"
          onChange={onUpload}
          className="hidden"
        />
      </div>
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </div>
  );
}
