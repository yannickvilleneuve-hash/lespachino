"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setErr(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={onSubmit}
        className="bg-white p-8 rounded shadow w-full max-w-sm"
      >
        <h1 className="text-xl font-semibold mb-4">Connexion</h1>
        <label className="block text-sm mb-1">Courriel</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2 mb-4"
          disabled={status === "sending"}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full bg-blue-700 text-white py-2 rounded disabled:opacity-50"
        >
          {status === "sending" ? "Envoi..." : "Recevoir lien magique"}
        </button>
        {status === "sent" && (
          <p className="text-green-700 text-sm mt-3">
            Lien envoyé. Vérifie tes courriels.
          </p>
        )}
        {status === "error" && (
          <p className="text-red-600 text-sm mt-3">{err}</p>
        )}
      </form>
    </main>
  );
}
