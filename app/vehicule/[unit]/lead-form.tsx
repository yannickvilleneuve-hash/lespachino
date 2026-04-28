"use client";

import { useState, useTransition } from "react";
import { submitLead } from "@/lib/leads/actions";

export default function LeadForm({ unit }: { unit: string }) {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitLead(fd);
      if (res.ok) {
        setStatus("sent");
        if (typeof window !== "undefined" && window.fbq) {
          window.fbq("track", "Lead", { content_ids: [unit], content_type: "vehicle" });
        }
        (e.target as HTMLFormElement).reset();
      } else {
        setErr(res.error);
        setStatus("error");
      }
    });
  }

  if (status === "sent") {
    return (
      <p className="mt-4 p-3 bg-green-50 text-green-800 text-sm rounded">
        Merci&nbsp;! Un vendeur va te rappeler sous peu.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-2">
      <input type="hidden" name="unit" value={unit} />
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">Nom</label>
        <input
          name="name"
          required
          minLength={2}
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">Téléphone</label>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">Courriel</label>
        <input
          name="email"
          type="email"
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">Message (optionnel)</label>
        <textarea
          name="message"
          rows={3}
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-blue-700 hover:bg-blue-800 text-white py-2 rounded text-sm disabled:opacity-50"
      >
        {pending ? "Envoi..." : "Me rappeler"}
      </button>
      <p className="text-[10px] text-gray-400 text-center">
        Téléphone OU courriel requis.
      </p>
      {status === "error" && <p className="text-xs text-red-600">{err}</p>}
    </form>
  );
}
