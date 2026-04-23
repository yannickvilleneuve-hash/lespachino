import { getLespacConfig } from "./config";
import type { LespacListing, LespacState } from "./types";
import type { InventoryDetail } from "@/lib/listings/queries";
import type { PhotoWithUrl } from "@/lib/listings/photos";

/** Valeurs autorisées pour attribut "Marque" chez Lespac (Véhicules - Camions). */
const LESPAC_MARQUES_LOURDS = new Set([
  "Freightliner", "Hino", "International", "Kenworth", "Mack", "Peterbilt", "Yale",
]);
const LESPAC_MARQUES_LEGERS = new Set([
  "Acura", "Aston Martin", "Audi", "Bentley", "BMW", "Buick", "Cadillac", "Campagna",
  "Chevrolet", "Chrysler", "Citroën", "Dodge", "Ferrari", "Ford", "GMC", "Honda",
  "Hummer", "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia", "Lada", "Lamborghini",
  "Land Rover", "Lexus", "Lincoln", "Lotus", "Maserati", "Maybach", "Mazda",
  "Mercedes", "Mercury", "Mini", "Mitsubishi", "Nissan", "Oldsmobile", "Peugeot",
  "Plymouth", "Pontiac", "Porsche", "RAM", "Renault", "Rolls Royce", "Saab",
  "Saturn", "Scion", "Smart", "Subaru", "Suzuki", "Toyota", "Volkswagen", "Volvo",
]);

function normalizeMake(serti: string): { make: string; type: "Camion lourd" | "Camion léger" | "Autres / N/A" } {
  const trimmed = serti.trim();
  // Match exact avec Hino/Ford/etc. (SERTI est UPPERCASE donc on title-case pour matcher Lespac).
  const title = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();

  if (LESPAC_MARQUES_LOURDS.has(title)) {
    return { make: title, type: "Camion lourd" };
  }
  if (LESPAC_MARQUES_LEGERS.has(title)) {
    return { make: title, type: "Camion léger" };
  }
  // Cas non standard (ex: EZ-HAULER, TRANSIT, MIDDL) → fallback lourd + marque "Autre".
  return { make: "Autre camion lourd", type: "Camion lourd" };
}

function mapState(category: string): LespacState {
  const c = category.toUpperCase();
  if (c.includes("NEUF") || c.includes("NEUV")) return "NEW";
  return "USED";
}

/** Sélectionne la catégorie Lespac selon la catégorie SERTI.
 *  Camions → "Véhicules - Camions"
 *  Remorques/Boîtes → "Véhicules - Machineries commerciales/agricoles" */
function mapCategory(category: string): string {
  const c = category.toUpperCase();
  if (c.includes("REMORQUE") || c.includes("BOITE")) {
    return "Véhicules - Machineries commerciales/agricoles";
  }
  return "Véhicules - Camions";
}

function buildTitle(d: InventoryDetail): string {
  const parts = [String(d.year || ""), d.make, d.model].filter(Boolean);
  let title = parts.join(" ").trim();
  if (!title) title = `Camion ${d.unit}`;
  return title.slice(0, 150);
}

export interface MappingInput {
  detail: InventoryDetail;
  photos: PhotoWithUrl[];
  publicListingUrl: string;
}

export function mapToLespacListing({ detail, photos, publicListingUrl }: MappingInput): LespacListing {
  const cfg = getLespacConfig();
  const { make, type: truckType } = normalizeMake(detail.make);
  const state = mapState(detail.category);
  const category = mapCategory(detail.category);

  const attributes: Record<string, string> = {
    "Type de camion": category === "Véhicules - Camions" ? truckType : "Autres / N/A",
    "Marque": make,
    // Lespac exige Kilométrage pour Véhicules - Camions. 0 pour les neufs.
    "Kilométrage": String(Math.max(0, Math.round(detail.km))),
  };
  if (detail.model) attributes["Modèle"] = detail.model.slice(0, 50);
  if (detail.color) attributes["Couleur extérieure"] = detail.color.slice(0, 40);
  if (detail.vin) attributes["NIV"] = detail.vin.slice(0, 40);

  return {
    listingId: null,
    vendorId: detail.unit,
    category,
    title: buildTitle(detail),
    description: detail.description_fr || undefined,
    price: detail.price_cad > 0 ? detail.price_cad : null,
    priceNote: null,
    videoURL: null,
    postalCode: cfg.dealer.postalCode,
    year: detail.year > 0 ? detail.year : null,
    state,
    listingURL: publicListingUrl,
    contact: {
      type: "STANDARD",
      emailAddress: cfg.dealer.email,
      firstName: cfg.dealer.firstName,
      lastName: cfg.dealer.lastName,
      phone1: cfg.dealer.phone,
    },
    status: "ONLINE",
    imageURLs: photos.map((p) => p.url),
    attributes,
  };
}
