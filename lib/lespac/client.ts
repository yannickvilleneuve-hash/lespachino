import { getLespacConfig } from "./config";
import type { LespacListing, LespacListingSummary, LespacSaveResponse } from "./types";

async function lespacFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const { token, baseUrl } = getLespacConfig();
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `LPC token="${token}"`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Lespac ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (res.status === 204 || !ct.includes("json")) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Crée ou met à jour une annonce par notre identifiant (vendorId = unit#). */
export function upsertByVendorId(
  vendorId: string,
  listing: LespacListing,
  deactivatePublication = false,
): Promise<LespacSaveResponse> {
  const qs = deactivatePublication ? "?deactivatePublication=true" : "";
  return lespacFetch<LespacSaveResponse>(
    "PUT",
    `/sell-api/v1.0/listings/vendorId/${encodeURIComponent(vendorId)}${qs}`,
    listing,
  );
}

export function deleteByVendorId(vendorId: string): Promise<void> {
  return lespacFetch<void>(
    "DELETE",
    `/sell-api/v1.0/listings/vendorId/${encodeURIComponent(vendorId)}`,
  );
}

export function activateByVendorId(vendorId: string): Promise<LespacListingSummary> {
  return lespacFetch<LespacListingSummary>(
    "PUT",
    `/sell-api/v1.0/listings/vendorId/${encodeURIComponent(vendorId)}/activate`,
  );
}

export function deactivateByVendorId(vendorId: string): Promise<LespacListingSummary> {
  return lespacFetch<LespacListingSummary>(
    "PUT",
    `/sell-api/v1.0/listings/vendorId/${encodeURIComponent(vendorId)}/deactivate`,
  );
}

export function getByVendorId(vendorId: string): Promise<LespacListing | null> {
  return lespacFetch<LespacListing | null>(
    "GET",
    `/sell-api/v1.0/listings/vendorId/${encodeURIComponent(vendorId)}`,
  ).catch((err) => {
    if (err instanceof Error && /→ 404:/.test(err.message)) return null;
    throw err;
  });
}

export async function listAll(): Promise<LespacListingSummary[]> {
  const res = await lespacFetch<{ listingSummary: LespacListingSummary }[] | LespacListingSummary[]>(
    "GET",
    "/sell-api/v1.0/listings",
  );
  // L'API retourne parfois des entrées avec un wrapper `listingSummary`.
  return (res ?? []).map((r) =>
    (r as { listingSummary: LespacListingSummary }).listingSummary ?? (r as LespacListingSummary),
  );
}
