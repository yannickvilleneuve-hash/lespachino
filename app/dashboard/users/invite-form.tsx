"use client";

import { useState, useTransition } from "react";
import { inviteUser } from "@/lib/auth/actions";

export default function InviteForm() {
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.append("origin", window.location.origin);
    const form = e.currentTarget;
    setStatus("idle");
    setMsg("");
    startTransition(async () => {
      const result = await inviteUser(fd);
      if (result.ok) {
        setStatus("ok");
        setMsg("Invitation envoyée.");
        form.reset();
      } else {
        setStatus("err");
        setMsg(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
      <input
        type="email"
        name="email"
        required
        placeholder="prenom@camion-hino.ca"
        className="border rounded px-3 py-2 text-sm"
        disabled={isPending}
      />
      <input
        type="text"
        name="full_name"
        placeholder="Nom complet (facultatif)"
        className="border rounded px-3 py-2 text-sm"
        disabled={isPending}
      />
      <button
        type="submit"
        disabled={isPending}
        className="bg-blue-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
      >
        {isPending ? "Envoi..." : "Inviter"}
      </button>
      {status === "ok" && (
        <p className="sm:col-span-3 text-sm text-green-700">{msg}</p>
      )}
      {status === "err" && (
        <p className="sm:col-span-3 text-sm text-red-600">{msg}</p>
      )}
    </form>
  );
}
