import { createHash } from "node:crypto";
import type { NormalizedListing } from "@/lib/bot/types";

/**
 * Stable sha256 (hex) over the fields we actually publish: title, price,
 * description, and the set of photo URLs (order-independent — sorted before
 * hashing). lespacId is deliberately excluded: it identifies the listing, it
 * is not published content. A change in this hash means the mirror needs an
 * UPDATE.
 */
export function computeContentHash(l: NormalizedListing): string {
  const canonical = JSON.stringify({
    title: l.title,
    priceCad: l.priceCad,
    description: l.description,
    photoUrls: [...l.photoUrls].sort(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
