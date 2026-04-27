"use client";

import { useState, useTransition } from "react";
import { removeUser } from "@/lib/auth/actions";

export default function RemoveButton({ email }: { email: string }) {
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState("");

  function onClick() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setErr("");
    startTransition(async () => {
      try {
        await removeUser(email);
      } catch (e) {
        setErr((e as Error).message);
        setConfirm(false);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {err && <span className="text-xs text-red-600">{err}</span>}
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className={
          confirm
            ? "text-xs text-red-700 font-semibold underline disabled:opacity-50"
            : "text-xs text-red-600 hover:underline disabled:opacity-50"
        }
      >
        {isPending ? "Retrait..." : confirm ? "Confirmer ?" : "Retirer"}
      </button>
    </span>
  );
}
