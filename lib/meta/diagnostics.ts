import { fetchPublicListings, type PublicListing } from "@/lib/listings/public";

const GRAPH_API = "https://graph.facebook.com/v25.0";

export interface MetaCatalogSnapshot {
  id: string;
  name?: string;
  vertical?: string;
  product_count?: number;
  feed_count?: number;
  business?: { id?: string; name?: string } | string;
}

export interface MetaFeedSnapshot {
  id: string;
  name?: string;
  country?: string;
  created_time?: string;
  default_currency?: string;
  encoding?: string;
  file_name?: string;
  product_count?: number;
  schedule?: {
    id?: string;
    interval?: string;
    interval_count?: number;
    hour?: number;
    minute?: number;
    timezone?: string;
    url?: string;
  };
  latest_upload?: {
    id?: string;
    start_time?: string;
    end_time?: string;
  };
}

export interface MetaUploadIssue {
  id?: string;
  summary?: string;
  description?: string;
  severity?: string;
}

export interface MetaUploadSnapshot {
  id: string;
  start_time?: string;
  end_time?: string;
  error_count?: number;
  warning_count?: number;
  num_detected_items?: number;
  num_persisted_items?: number;
  num_invalid_items?: number;
  num_deleted_items?: number;
  url?: string;
  errors?: { data?: MetaUploadIssue[] };
  warnings?: { data?: MetaUploadIssue[] };
  error_report?: { report_status?: string };
}

export interface MetaFeedEligibility {
  native_count: number;
  facebook_selected_count: number;
  facebook_feed_ready_count: number;
  facebook_ready_available_count: number;
  selected_missing_price: string[];
  selected_missing_photo: string[];
}

export interface MetaImportAlert {
  error_count: number;
  warning_count: number;
  end_time?: string;
  summary: string;
  description?: string;
}

export type MetaDiagnostics =
  | {
      ok: true;
      catalog: MetaCatalogSnapshot | null;
      feed: MetaFeedSnapshot | null;
      latest_upload: MetaUploadSnapshot | null;
      eligibility: MetaFeedEligibility;
      feed_url: string | null;
    }
  | {
      ok: false;
      missing: string[];
      error?: string;
    };

function metaConfig(): {
  accessToken: string | null;
  catalogId: string | null;
  feedId: string | null;
} {
  return {
    accessToken: process.env.META_ACCESS_TOKEN ?? null,
    catalogId: process.env.META_CATALOG_ID ?? null,
    feedId: process.env.META_FEED_ID ?? null,
  };
}

async function graphGet<T>(
  accessToken: string,
  id: string,
  fields: string,
): Promise<T> {
  const url = new URL(`${GRAPH_API}/${id}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const resp = await fetch(url, { cache: "no-store" });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Meta ${id}: HTTP ${resp.status} ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

function hasHeroAndPrice(
  listing: PublicListing,
): listing is PublicListing & { hero_url: string } {
  return listing.hero_url !== null && listing.price_cad > 0;
}

async function fetchEligibility(): Promise<MetaFeedEligibility> {
  const [nativeListings, facebookListings] = await Promise.all([
    fetchPublicListings({ channel: "native" }),
    fetchPublicListings({ channel: "fb_marketplace" }),
  ]);
  return {
    native_count: nativeListings.length,
    facebook_selected_count: facebookListings.length,
    facebook_feed_ready_count: facebookListings.filter(hasHeroAndPrice).length,
    facebook_ready_available_count: nativeListings.filter(hasHeroAndPrice).length,
    selected_missing_price: facebookListings
      .filter((l) => l.price_cad <= 0)
      .map((l) => l.unit),
    selected_missing_photo: facebookListings
      .filter((l) => l.hero_url === null)
      .map((l) => l.unit),
  };
}

export async function fetchMetaDiagnostics(): Promise<MetaDiagnostics> {
  const { accessToken, catalogId, feedId } = metaConfig();
  const missing = [
    !accessToken ? "META_ACCESS_TOKEN" : null,
    !catalogId ? "META_CATALOG_ID" : null,
    !feedId ? "META_FEED_ID" : null,
  ].filter((v): v is string => Boolean(v));
  if (missing.length > 0) return { ok: false, missing };
  if (!accessToken || !catalogId || !feedId) return { ok: false, missing };
  const token = accessToken;
  const catalog = catalogId;
  const feedConfigId = feedId;

  try {
    const [catalogSnapshot, feed, eligibility] = await Promise.all([
      graphGet<MetaCatalogSnapshot>(
        token,
        catalog,
        "id,name,vertical,product_count,feed_count,business",
      ),
      graphGet<MetaFeedSnapshot>(
        token,
        feedConfigId,
        "id,name,country,created_time,default_currency,encoding,file_name,product_count,schedule,latest_upload",
      ),
      fetchEligibility(),
    ]);

    const latestUploadId = feed.latest_upload?.id ?? null;
    const latestUpload = latestUploadId
      ? await graphGet<MetaUploadSnapshot>(
          token,
          latestUploadId,
          "id,start_time,end_time,error_count,warning_count,num_detected_items,num_persisted_items,num_invalid_items,num_deleted_items,url,errors,warnings,error_report",
        )
      : null;

    return {
      ok: true,
      catalog: catalogSnapshot,
      feed,
      latest_upload: latestUpload,
      eligibility,
      feed_url: feed.schedule?.url ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      missing: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchMetaImportAlert(): Promise<MetaImportAlert | null> {
  const { accessToken, feedId } = metaConfig();
  if (!accessToken || !feedId) return null;
  try {
    const feed = await graphGet<MetaFeedSnapshot>(
      accessToken,
      feedId,
      "id,latest_upload",
    );
    const latestUploadId = feed.latest_upload?.id;
    if (!latestUploadId) return null;
    const latestUpload = await graphGet<MetaUploadSnapshot>(
      accessToken,
      latestUploadId,
      "id,end_time,error_count,warning_count,errors,warnings",
    );
    const errorCount = latestUpload.error_count ?? 0;
    if (errorCount <= 0) return null;
    const firstError = latestUpload.errors?.data?.[0];
    return {
      error_count: errorCount,
      warning_count: latestUpload.warning_count ?? 0,
      end_time: latestUpload.end_time,
      summary: firstError?.summary ?? "Dernier import Meta en erreur",
      description: firstError?.description,
    };
  } catch {
    return null;
  }
}
