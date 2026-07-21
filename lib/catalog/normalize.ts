import type { LespacListing } from "@/lib/lespac/types";
import type {
  BodyStyle,
  CatalogVehicle,
  FuelType,
  Transmission,
} from "@/lib/catalog/types";

/** Strip accents + case so "Kilométrage" and "kilometrage" both resolve. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * LesPAC attribute keys are free-form French strings typed by whoever posted the
 * ad. Look up by folded key so a missing accent does not silently drop a field
 * from every feed item.
 */
function attr(
  attributes: Record<string, string> | undefined,
  ...candidates: string[]
): string | null {
  if (!attributes) return null;
  const folded = new Map(Object.entries(attributes).map(([k, v]) => [fold(k), v]));
  for (const c of candidates) {
    const hit = folded.get(fold(c));
    if (hit?.trim()) return hit.trim();
  }
  return null;
}

/** "150 000 km" / "150,000" / "249000" → number. Null when no digits. */
export function parseKm(raw: string | null): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

const YEAR_RE = /^(19|20)\d{2}$/;

function titleTokens(title: string): string[] {
  return title
    .split(/\s+/)
    .map((t) => t.replace(/^[,;.]+|[,;.]+$/g, ""))
    .filter(Boolean);
}

/**
 * The real manufacturer.
 *
 * The LesPAC "Marque" attribute is a hand-picked dropdown and is wrong often
 * enough to poison the feed: listing 195485399 is titled "Isuzu NPR 2016" with
 * Marque="Hino", and 7 of 25 listings say "Autre camion léger". The title is
 * what the seller actually wrote and what a buyer reads.
 *
 * So: trust "Marque" only when it also appears in the title (it carries nicer
 * casing than a shouted "FORD"); otherwise take the first non-year token.
 */
export function resolveMake(
  title: string,
  markAttr: string | null,
): string {
  const tokens = titleTokens(title).filter((t) => !YEAR_RE.test(t));

  if (markAttr && !fold(markAttr).startsWith("autre")) {
    if (fold(title).includes(fold(markAttr))) return markAttr;
  }

  const first = tokens[0] ?? "";
  // "FORD" and "ISUZU" are shouted in some titles; "Isuzu" is what Meta wants.
  return first === first.toUpperCase() ? titleCase(first) : first;
}

function titleCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

/** Year from the LesPAC field, falling back to a 4-digit token in the title. */
export function resolveYear(
  lespacYear: number | null | undefined,
  title: string,
): number | null {
  if (lespacYear != null) return lespacYear;
  const hit = titleTokens(title).find((t) => YEAR_RE.test(t));
  return hit ? Number.parseInt(hit, 10) : null;
}

/** Model from the "Modèle" attribute, else the title minus year and make. */
export function resolveModel(
  title: string,
  make: string,
  modelAttr: string | null,
): string {
  if (modelAttr) return modelAttr;
  const rest = titleTokens(title).filter(
    (t) => !YEAR_RE.test(t) && fold(t) !== fold(make),
  );
  return rest.join(" ");
}

/**
 * LesPAC categories, observed 2026-07-10:
 *   Véhicules - Camions, - Utilitaires sport, - Minifourgonnettes
 *   Pneus, pièces & équipements - Équipements, - Remorques
 *
 * Only the "Véhicules" branch belongs in a vehicle feed. A bare 20-foot cargo
 * box has a price and photos and would otherwise sail through as a truck.
 */
export function isVehicleCategory(category: string): boolean {
  return fold(category).startsWith("vehicules");
}

export function resolveBodyStyle(category: string): BodyStyle {
  const c = fold(category);
  if (!c.startsWith("vehicules")) return "OTHER";
  if (c.includes("camion")) return "TRUCK";
  if (c.includes("utilitaire")) return "SUV";
  if (c.includes("minifourgonnette")) return "MINIVAN";
  if (c.includes("fourgonnette")) return "VAN";
  return "OTHER";
}

export function resolveTransmission(raw: string | null): Transmission | null {
  if (!raw) return null;
  const v = fold(raw);
  if (v.startsWith("automat")) return "AUTOMATIC";
  if (v.startsWith("manuel")) return "MANUAL";
  return null;
}

export function resolveFuelType(raw: string | null): FuelType | null {
  if (!raw) return null;
  const v = fold(raw);
  if (v.includes("diesel")) return "DIESEL";
  // LesPAC says "Sans plomb" (unleaded) where Meta says GASOLINE.
  if (v.includes("sans plomb") || v.includes("essence")) return "GASOLINE";
  return null;
}

/** "BLANC" and "Blanc" are the same colour; Meta shows it verbatim. */
export function resolveColor(raw: string | null): string | null {
  if (!raw) return null;
  return raw === raw.toUpperCase() ? titleCase(raw) : raw;
}

/**
 * Pure: reduce a LesPAC listing to the shape the catalog and every feed consume.
 * Never throws — a malformed listing yields empty strings, not a crash that
 * takes down the whole feed.
 */
export function normalizeListing(listing: LespacListing): CatalogVehicle {
  const title = listing.title ?? "";
  const category = listing.category ?? "";
  const a = listing.attributes;

  const make = resolveMake(title, attr(a, "Marque", "Make"));

  return {
    id: String(listing.listingId ?? ""),
    title,
    description: listing.description ?? "",
    priceCad: listing.price ?? null,
    year: resolveYear(listing.year, title),
    make,
    model: resolveModel(title, make, attr(a, "Modèle", "Model")),
    km: parseKm(attr(a, "Kilométrage", "Mileage")),
    isNew: listing.state === "NEW",
    isVehicle: isVehicleCategory(category),
    bodyStyle: resolveBodyStyle(category),
    exteriorColor: resolveColor(attr(a, "Couleur extérieure", "Exterior color")),
    transmission: resolveTransmission(attr(a, "Transmission")),
    fuelType: resolveFuelType(attr(a, "Type de carburant", "Fuel type")),
    photoUrls: listing.imageURLs ?? [],
  };
}
