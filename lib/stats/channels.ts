import { createAdminClient } from "@/lib/supabase/admin";

export type Source =
  | "direct"
  | "facebook"
  | "fb_marketplace"
  | "instagram"
  | "google"
  | "lespac"
  | "kijiji"
  | "wix"
  | "autre";

export const SOURCE_LABELS: Record<Source, string> = {
  direct: "Direct",
  facebook: "Facebook",
  fb_marketplace: "FB Marketplace",
  instagram: "Instagram",
  google: "Google",
  lespac: "Lespac",
  kijiji: "Kijiji",
  wix: "Site Wix",
  autre: "Autre",
};

const SOURCE_ORDER: Source[] = [
  "direct",
  "facebook",
  "fb_marketplace",
  "instagram",
  "google",
  "lespac",
  "kijiji",
  "wix",
  "autre",
];

/** Classifie un referrer en source connue (utilitaire pur). */
export function classifySource(referrer: string | null | undefined): Source {
  if (!referrer || referrer.trim() === "") return "direct";
  const r = referrer.toLowerCase();
  if (r.includes("marketplace.facebook") || r.includes("/marketplace/"))
    return "fb_marketplace";
  if (r.includes("facebook.com") || r.includes("fb.me") || r.includes("fb.com"))
    return "facebook";
  if (r.includes("instagram.com")) return "instagram";
  if (r.includes("lespac.com")) return "lespac";
  if (r.includes("kijiji.ca")) return "kijiji";
  if (r.includes("google.")) return "google";
  if (
    r.includes("wix.com") ||
    r.includes("wixsite.com") ||
    r.includes("camion-hino.ca")
  )
    return "wix";
  return "autre";
}

export interface ChannelStats {
  views_7d: number;
  views_30d: number;
  leads_7d: number;
  leads_30d: number;
  /** Nombre de vues par source dans la fenêtre choisie. */
  by_source_7d: { source: Source; count: number }[];
  by_source_30d: { source: Source; count: number }[];
  /** Top 10 véhicules par vues 30j avec leads associés. */
  top_units_30d: { unit: string; views: number; leads: number }[];
  /** 30 derniers jours, vues quotidiennes (ISO date YYYY-MM-DD). */
  daily_30d: { day: string; views: number }[];
}

export async function fetchChannelStats(): Promise<ChannelStats> {
  const admin = createAdminClient();
  const now = Date.now();
  const iso30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [viewsRes, leadsRes] = await Promise.all([
    admin
      .from("view_event")
      .select("unit, referrer, created_at")
      .gte("created_at", iso30)
      .limit(20000),
    admin
      .from("lead")
      .select("unit, created_at")
      .gte("created_at", iso30)
      .limit(5000),
  ]);
  if (viewsRes.error) throw new Error(`views: ${viewsRes.error.message}`);
  if (leadsRes.error) throw new Error(`leads: ${leadsRes.error.message}`);

  const cutoff7 = now - 7 * 24 * 60 * 60 * 1000;
  const views = viewsRes.data ?? [];
  const leads = leadsRes.data ?? [];

  let views7 = 0;
  const src7 = new Map<Source, number>();
  const src30 = new Map<Source, number>();
  const unitViews = new Map<string, number>();
  const dayBuckets = new Map<string, number>();

  for (const v of views) {
    const ts = new Date(v.created_at).getTime();
    const src = classifySource(v.referrer);
    src30.set(src, (src30.get(src) ?? 0) + 1);
    unitViews.set(v.unit, (unitViews.get(v.unit) ?? 0) + 1);
    const day = String(v.created_at).slice(0, 10);
    dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
    if (ts >= cutoff7) {
      views7 += 1;
      src7.set(src, (src7.get(src) ?? 0) + 1);
    }
  }

  let leads7 = 0;
  const unitLeads = new Map<string, number>();
  for (const l of leads) {
    const ts = new Date(l.created_at).getTime();
    if (ts >= cutoff7) leads7 += 1;
    unitLeads.set(l.unit, (unitLeads.get(l.unit) ?? 0) + 1);
  }

  const orderSource = (m: Map<Source, number>) =>
    SOURCE_ORDER.filter((s) => (m.get(s) ?? 0) > 0).map((source) => ({
      source,
      count: m.get(source) ?? 0,
    }));

  const top_units_30d = Array.from(unitViews.entries())
    .map(([unit, viewsCount]) => ({
      unit,
      views: viewsCount,
      leads: unitLeads.get(unit) ?? 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const daily_30d: { day: string; views: number }[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    daily_30d.push({ day: d, views: dayBuckets.get(d) ?? 0 });
  }

  return {
    views_7d: views7,
    views_30d: views.length,
    leads_7d: leads7,
    leads_30d: leads.length,
    by_source_7d: orderSource(src7),
    by_source_30d: orderSource(src30),
    top_units_30d,
    daily_30d,
  };
}
