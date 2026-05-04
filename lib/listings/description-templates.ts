/**
 * Templates de description véhicule, dérivés des textes du vendeur.
 * Détecte la classe châssis depuis le modèle, ajoute features de boîte
 * choisie au dropdown, et émet un texte propre (puces, ponctuation
 * cohérente, sans typos).
 */

export type BodyType =
  | "none"
  | "fourgon_rampe"
  | "fourgon_montecharge"
  | "fourgon_frio"
  | "frio_l7"
  | "deck_28"
  | "towing";

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  none: "Aucune carrosserie",
  fourgon_rampe: "Fourgon avec rampe",
  fourgon_montecharge: "Fourgon avec monte-charge",
  fourgon_frio: "Fourgon réfrigéré (Class 5)",
  frio_l7: "Réfrigéré L7 (Class 7)",
  deck_28: "Fourgon avec deck cabine",
  towing: "Towing / dépanneuse",
};

export const BODY_TYPES_ORDER: BodyType[] = [
  "none",
  "fourgon_rampe",
  "fourgon_montecharge",
  "fourgon_frio",
  "frio_l7",
  "deck_28",
  "towing",
];

interface ChassisProfile {
  klass: 5 | 7;
  trans: string;
}

const MODEL_PROFILES: Record<string, ChassisProfile> = {
  "195": { klass: 5, trans: "Transmission automatique" },
  NRR: { klass: 5, trans: "Transmission automatique" },
  "338": { klass: 7, trans: "Transmission automatique Allison" },
  "358": { klass: 7, trans: "Transmission automatique Allison 3000 RDS" },
  L7: { klass: 7, trans: "Transmission automatique Allison" },
  L8: { klass: 7, trans: "Transmission automatique Allison" },
  L9: { klass: 7, trans: "Transmission automatique Allison" },
};

export function detectChassis(make: string, model: string): ChassisProfile {
  const m = (model ?? "").trim().toUpperCase();
  if (MODEL_PROFILES[m]) return MODEL_PROFILES[m];
  if (/^L[789]$/.test(m) || /338|358/.test(m)) {
    return { klass: 7, trans: "Transmission automatique Allison" };
  }
  return { klass: 5, trans: "Transmission automatique" };
}

export interface SuggestOptions {
  body_type: BodyType;
  /** longueur boîte en pieds (18, 20, 22, 26, 28) */
  body_length_ft?: number;
  /** marque/modèle équipement ex "Maxon TE-20", "ATC", "RÉKA" */
  equipment_brand?: string;
  /** "Prêt à travailler" */
  ready_to_work?: boolean;
  /** "Excellente condition" */
  excellent_condition?: boolean;
  /** "Camion presque neuf" */
  almost_new?: boolean;
  /** ex "Mars 2023" — laisse vide pour omettre */
  saaq_inspection?: string;
}

export interface VehicleInput {
  year: number;
  make: string;
  model: string;
  km: number;
}

function baseFeatures(c: ChassisProfile): string[] {
  const list = [
    c.trans,
    "Air conditionné",
    "Régulateur de vitesse",
    "Vitres électriques",
    "Serrures de portes électriques avec télécommande",
    "Miroirs chauffants et électriques",
    c.klass === 7 ? "Frein moteur" : "Frein d'échappement",
    "Radio Bluetooth",
    "Siège conducteur à suspension pneumatique",
  ];
  if (c.klass === 7) {
    list.push("Freins pneumatiques", "Suspension pneumatique", "Roues en aluminium Alcoa");
  }
  return list;
}

function lenStr(opts: SuggestOptions): string {
  const n = opts.body_length_ft ?? 0;
  return n > 0 ? `${n} pieds` : "X pieds";
}

function bodyFeatures(opts: SuggestOptions): string[] {
  switch (opts.body_type) {
    case "fourgon_rampe":
      return [
        `Fourgon de ${lenStr(opts)} (largeur 102 po × hauteur 96 po)`,
        "Rampe de chargement",
      ];
    case "fourgon_montecharge":
      return [
        `Fourgon de ${lenStr(opts)} (largeur 102 po)`,
        opts.equipment_brand
          ? `Monte-charge ${opts.equipment_brand}`
          : "Monte-charge",
      ];
    case "fourgon_frio":
      return [
        `Fourgon de ${lenStr(opts)} de marque Frio, isolé`,
        opts.equipment_brand
          ? `Unité de réfrigération ${opts.equipment_brand}`
          : "Unité de réfrigération ATC",
      ];
    case "frio_l7":
      return [
        `Fourgon réfrigéré de marque Frio, ${lenStr(opts)}`,
        "Réservoir en aluminium de 90 gallons",
      ];
    case "deck_28":
      return [
        `Fourgon de marque Transit, ${lenStr(opts)}`,
        "Deck au-dessus de la cabine",
      ];
    case "towing":
      return [
        `Plate-forme hydraulique de marque RÉKA, ${lenStr(opts)}`,
        "Treuil",
        "Wheel lift",
      ];
    case "none":
    default:
      return [];
  }
}

function trailingMentions(opts: SuggestOptions, v: VehicleInput): string[] {
  const out: string[] = [];
  if (v.km > 0) {
    out.push(`Seulement ${v.km.toLocaleString("fr-CA")} km`);
  }
  if (opts.saaq_inspection && opts.saaq_inspection.trim()) {
    out.push(`Inspection SAAQ effectuée en ${opts.saaq_inspection.trim()}`);
  }
  if (opts.almost_new) out.push("Camion presque neuf");
  if (opts.excellent_condition) out.push("Excellente condition");
  if (opts.ready_to_work) out.push("Prêt à travailler");
  return out;
}

/** Émet une description multi-lignes avec puces. Format prévisible et propre. */
export function suggestDescription(v: VehicleInput, opts: SuggestOptions): string {
  const c = detectChassis(v.make, v.model);
  const title = [v.year || "", v.make, v.model].filter(Boolean).join(" ").trim();
  const features = [...baseFeatures(c), ...bodyFeatures(opts)];
  const mentions = trailingMentions(opts, v);
  const lines: string[] = [];
  if (title) {
    lines.push(title);
    lines.push("");
  }
  for (const f of features) lines.push(`• ${f}`);
  if (mentions.length > 0) {
    lines.push("");
    for (const m of mentions) lines.push(`• ${m}`);
  }
  return lines.join("\n");
}
