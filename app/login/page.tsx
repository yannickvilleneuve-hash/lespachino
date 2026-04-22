"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { sendMagicLink } from "./actions";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  const [isPending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await sendMagicLink(fd);
      if (result.ok) {
        setStatus("sent");
      } else {
        setErr(result.error);
        setStatus("error");
      }
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={onSubmit}
        className="bg-white p-8 rounded shadow w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <Image
            src="/logo1.jpg"
            alt="Centre du camion Hino"
            width={78}
            height={32}
            priority
            className="rounded-sm"
          />
          <h1 className="text-lg font-semibold">Ventes — Interne</h1>
        </div>
        <label className="block text-sm mb-1">Courriel</label>
        <input
          type="email"
          name="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2 mb-4"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-700 text-white py-2 rounded disabled:opacity-50"
        >
          {isPending ? "Envoi..." : "Recevoir lien magique"}
        </button>
        {status === "sent" && (
          <p className="text-green-700 text-sm mt-3">
            Lien envoyé à <strong>{email}</strong>. Vérifie tes courriels (inbox + spam).
          </p>
        )}
        {status === "error" && <p className="text-red-600 text-sm mt-3">{err}</p>}
        <p className="text-xs text-gray-500 mt-6 text-center">
          Envoyé depuis <code>service@camion-hino.ca</code>
        </p>
      </form>
    </main>
  );
}
