import { photoSrc, type SnapshotVehicle } from "@/lib/catalog/read";
import { displayPrice, displayTitle } from "@/app/vehicule/format";

/**
 * One card of the home-page strip, as WordPress consumes it.
 *
 * Everything is pre-rendered to strings on purpose: `price` is already
 * "55 800 $" or "Prix à discuter", `url` is absolute. The PHP side does no
 * formatting and no business logic — it prints what it gets, so a rule change
 * (price display, title source) ships from here, once, and never drifts
 * between the two sites.
 */
export interface CarouselItem {
  id: string;
  title: string;
  price: string;
  /** Null on "prix à discuter", so a consumer can sort or filter if it wants. */
  priceCad: number | null;
  condition: "Neuf" | "Usagé";
  year: number | null;
  make: string;
  model: string;
  /** Hero photo, straight from storage. Null when the vehicle has no photo. */
  photo: string | null;
  /** Absolute link to the vehicle page on the app's public origin. */
  url: string;
}

export interface CarouselJson {
  generatedAt: string;
  inventoryUrl: string;
  items: CarouselItem[];
}

/** PURE: the strip's rows → the JSON the WordPress shortcode renders. */
export function buildCarouselJson(opts: {
  rows: SnapshotVehicle[];
  origin: string;
  inventoryUrl: string;
  now?: Date;
}): CarouselJson {
  const { rows, origin, inventoryUrl } = opts;
  return {
    generatedAt: (opts.now ?? new Date()).toISOString(),
    inventoryUrl,
    items: rows.map((row) => {
      const v = row.vehicle;
      const hero = row.photos[0];
      return {
        id: v.id,
        title: displayTitle(v),
        price: displayPrice(v.priceCad),
        priceCad: v.priceCad,
        condition: v.isNew ? "Neuf" : "Usagé",
        year: v.year,
        make: v.make,
        model: v.model,
        photo: hero ? photoSrc(hero) : null,
        url: `${origin}/vehicule/${encodeURIComponent(v.id)}`,
      };
    }),
  };
}
