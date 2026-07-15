"use client";

import { useActionState } from "react";
import { submitLead, type LeadState } from "@/lib/leads/actions";

const initial: LeadState = { ok: false, message: "" };

const inputClass =
  "w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none transition focus:border-[#ed1c24] focus:bg-white/10";

export function LeadForm({ unit, title }: { unit: string; title: string }) {
  const [state, action, pending] = useActionState(submitLead, initial);

  if (state.ok) {
    return (
      <p className="rounded-md border border-[#ed1c24]/40 bg-[#ed1c24]/10 px-4 py-4 font-semibold text-white">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="unit" value={unit} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Votre nom *" className={inputClass} />
        <input name="phone" type="tel" placeholder="Téléphone" className={inputClass} />
      </div>
      <input name="email" type="email" placeholder="Courriel" className={inputClass} />
      <textarea
        name="message"
        rows={3}
        defaultValue={`Bonjour, je suis intéressé par le ${title}. `}
        className={`${inputClass} resize-none`}
      />
      {state.message && !state.ok && (
        <p className="text-sm text-[#ff6b6b]">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md bg-[#ed1c24] px-6 py-3 text-sm font-bold uppercase tracking-widest text-white transition hover:bg-[#c10e15] disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Envoyer le message"}
      </button>
    </form>
  );
}
