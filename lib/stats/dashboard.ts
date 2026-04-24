import { createAdminClient } from "@/lib/supabase/admin";
import { listActiveVehicles } from "@/lib/serti/wgi";

export interface DashboardStats {
  activeVehicles: number;
  listingsTotal: number;
  published: number;
  drafts: number;
  hidden: number;
  withoutListing: number;
  avgPrice: number;
  maxPrice: number;
  photosTotal: number;
  views7d: number;
  views30d: number;
  leads7d: number;
  leads30d: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const admin = createAdminClient();
  const iso = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [vehicles, listingsRes, photosRes, views7dRes, views30dRes, leads7dRes, leads30dRes] =
    await Promise.all([
      listActiveVehicles(),
      admin.from("listing").select("unit, price_cad, is_published, hidden"),
      admin.from("vehicle_photo").select("id", { count: "exact", head: true }),
      admin.from("view_event").select("id", { count: "exact", head: true }).gte("created_at", iso(7)),
      admin.from("view_event").select("id", { count: "exact", head: true }).gte("created_at", iso(30)),
      admin.from("lead").select("id", { count: "exact", head: true }).gte("created_at", iso(7)),
      admin.from("lead").select("id", { count: "exact", head: true }).gte("created_at", iso(30)),
    ]);

  if (listingsRes.error) throw new Error(`listings: ${listingsRes.error.message}`);

  const activeVehicles = vehicles.length;
  const listings = listingsRes.data;
  const listingUnits = new Set(listings.map((l) => l.unit));

  const published = listings.filter((l) => l.is_published && !l.hidden).length;
  const drafts = listings.filter((l) => !l.is_published && !l.hidden).length;
  const hidden = listings.filter((l) => l.hidden).length;
  const withoutListing = vehicles.filter((v) => !listingUnits.has(v.unit)).length;

  const priced = listings.filter((l) => l.price_cad > 0 && l.is_published && !l.hidden);
  const avgPrice = priced.length > 0
    ? Math.round(priced.reduce((s, l) => s + l.price_cad, 0) / priced.length)
    : 0;
  const maxPrice = priced.length > 0 ? Math.max(...priced.map((l) => l.price_cad)) : 0;

  return {
    activeVehicles,
    listingsTotal: listings.length,
    published,
    drafts,
    hidden,
    withoutListing,
    avgPrice,
    maxPrice,
    photosTotal: photosRes.count ?? 0,
    views7d: views7dRes.count ?? 0,
    views30d: views30dRes.count ?? 0,
    leads7d: leads7dRes.count ?? 0,
    leads30d: leads30dRes.count ?? 0,
  };
}
