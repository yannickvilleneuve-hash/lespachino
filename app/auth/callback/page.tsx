"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Connexion en cours…");

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const errorDesc = params.get("error_description") || params.get("error");

    if (errorDesc) {
      queueMicrotask(() =>
        setMsg(`Erreur d'authentification : ${decodeURIComponent(errorDesc)}`),
      );
      const t = setTimeout(() => router.replace("/login?error=callback"), 2000);
      return () => clearTimeout(t);
    }

    if (!accessToken || !refreshToken) {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const supabase = createClient();
        supabase.auth
          .exchangeCodeForSession(code)
          .then(({ error }) => {
            if (error) {
              setMsg(`Erreur : ${error.message}`);
              setTimeout(() => router.replace("/login?error=callback"), 2000);
            } else {
              router.replace("/inventaire");
            }
          });
        return;
      }
      queueMicrotask(() => setMsg("Lien invalide ou expiré."));
      setTimeout(() => router.replace("/login?error=callback"), 1500);
      return;
    }

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setMsg(`Erreur : ${error.message}`);
          setTimeout(() => router.replace("/login?error=callback"), 2000);
        } else {
          router.replace("/inventaire");
        }
      });
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded shadow p-6 max-w-sm text-center">
        <p className="text-sm text-gray-700">{msg}</p>
      </div>
    </main>
  );
}
