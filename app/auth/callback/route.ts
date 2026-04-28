import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Origin/Host derrière Worker proxy = 0.0.0.0:3005 (bind address).
  // Lit Referer (qui contient le redirect Supabase vers notre origine
  // browser-facing). Fallback env ADMIN_SITE_URL.
  const referer = request.headers.get("referer");
  const baseUrl =
    (referer && new URL(referer).origin) ||
    process.env.ADMIN_SITE_URL ||
    "https://ventes.hinochicoutimi.com";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${baseUrl}/inventaire`);
  }
  return NextResponse.redirect(`${baseUrl}/login?error=callback`);
}
