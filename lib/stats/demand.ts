import { createAdminClient } from "@/lib/supabase/admin";
import { listInventoryVehicles } from "@/lib/serti/wgi";

export interface DemandSegment {
  key: string;
  label: string;
  units: number;
  views: number;
  leads: number;
  score: number;
}

export interface DemandOpportunity {
  unit: string;
  label: string;
  price_cad: number;
  views: number;
  leads: number;
  photo_clicks: number;
  recommendation: string;
}

export interface DemandInsights {
  segments: DemandSegment[];
  opportunities: DemandOpportunity[];
}

export async function fetchDemandInsights(): Promise<DemandInsights> {
  const admin = createAdminClient();
  const vehicles = await listInventoryVehicles();
  const units = vehicles.map((v) => v.unit);
  if (units.length === 0) return { segments: [], opportunities: [] };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [viewsRes, leadsRes, listingRes] = await Promise.all([
    admin
      .from("view_event")
      .select("unit, event_type")
      .in("unit", units)
      .gte("created_at", since)
      .limit(30000),
    admin
      .from("lead")
      .select("unit")
      .in("unit", units)
      .gte("created_at", since)
      .limit(5000),
    admin
      .from("listing")
      .select("unit, price_cad, is_published, hidden")
      .in("unit", units),
  ]);
  if (viewsRes.error) throw new Error(`views: ${viewsRes.error.message}`);
  if (leadsRes.error) throw new Error(`leads: ${leadsRes.error.message}`);
  if (listingRes.error) throw new Error(`listings: ${listingRes.error.message}`);

  const pageViewsByUnit = new Map<string, number>();
  const photoClicksByUnit = new Map<string, number>();
  for (const event of viewsRes.data ?? []) {
    const eventType = event.event_type ?? "page_view";
    if (eventType === "page_view") {
      pageViewsByUnit.set(event.unit, (pageViewsByUnit.get(event.unit) ?? 0) + 1);
    } else if (eventType === "photo_select" || eventType === "photo_open") {
      photoClicksByUnit.set(event.unit, (photoClicksByUnit.get(event.unit) ?? 0) + 1);
    }
  }

  const leadsByUnit = new Map<string, number>();
  for (const lead of leadsRes.data ?? []) {
    leadsByUnit.set(lead.unit, (leadsByUnit.get(lead.unit) ?? 0) + 1);
  }

  const listingByUnit = new Map((listingRes.data ?? []).map((l) => [l.unit, l]));
  const segmentMap = new Map<string, DemandSegment>();
  for (const vehicle of vehicles) {
    const key = [vehicle.make, vehicle.model, vehicle.category].filter(Boolean).join("|");
    const label = [vehicle.make, vehicle.model, vehicle.category].filter(Boolean).join(" · ");
    const current = segmentMap.get(key) ?? { key, label, units: 0, views: 0, leads: 0, score: 0 };
    current.units += 1;
    current.views += pageViewsByUnit.get(vehicle.unit) ?? 0;
    current.leads += leadsByUnit.get(vehicle.unit) ?? 0;
    current.score = current.leads * 12 + current.views;
    segmentMap.set(key, current);
  }

  const opportunities = vehicles
    .map((vehicle) => {
      const listing = listingByUnit.get(vehicle.unit);
      const views = pageViewsByUnit.get(vehicle.unit) ?? 0;
      const leads = leadsByUnit.get(vehicle.unit) ?? 0;
      const photoClicks = photoClicksByUnit.get(vehicle.unit) ?? 0;
      const price = listing?.price_cad ?? 0;
      let recommendation = "À surveiller";
      if (!listing?.is_published || listing.hidden) recommendation = "Publier ou réactiver";
      else if (views >= 10 && leads === 0) recommendation = "Revoir prix / description";
      else if (views >= 6 && photoClicks <= 1) recommendation = "Améliorer photo principale";
      else if (leads > 0) recommendation = "Relancer rapidement";
      return {
        unit: vehicle.unit,
        label: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
        price_cad: price,
        views,
        leads,
        photo_clicks: photoClicks,
        recommendation,
      };
    })
    .filter((o) => o.views > 0 || o.leads > 0 || o.recommendation === "Publier ou réactiver")
    .sort((a, b) => (b.leads * 12 + b.views + b.photo_clicks) - (a.leads * 12 + a.views + a.photo_clicks))
    .slice(0, 15);

  return {
    segments: Array.from(segmentMap.values())
      .filter((s) => s.views > 0 || s.leads > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12),
    opportunities,
  };
}
