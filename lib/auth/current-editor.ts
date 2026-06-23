import { headers } from "next/headers";

/** Who is editing — from Tailscale serve's identity header, else "operator". */
export async function currentEditor(): Promise<string> {
  const h = await headers();
  return h.get("tailscale-user-login") ?? "operator";
}
