import { getWixConfig } from "./config";

const WIX_API_BASE = "https://www.wixapis.com";

export interface WixInventoryItem {
  _id: string;
  title: string;
  unit: string;
  vin: string;
  year: number | null;
  make: string;
  model: string;
  category: string;
  km: number;
  color: string;
  priceCad: number;
  descriptionFr: string;
  state: "NEW" | "USED";
  heroImage: string | null;
  imageUrls: string[];
  detailUrl: string;
  dateAdded: string | null;
}

async function wixFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const { token, siteId } = getWixConfig();
  const res = await fetch(`${WIX_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: token,
      "wix-site-id": siteId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Wix ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (res.status === 204 || !ct.includes("json")) return undefined as T;
  return (await res.json()) as T;
}

/** Idempotent upsert: Wix "save" crée si _id absent, update sinon. */
export async function saveItem(item: WixInventoryItem): Promise<void> {
  const { collectionId } = getWixConfig();
  await wixFetch("POST", `/wix-data/v2/items/save?dataCollectionId=${encodeURIComponent(collectionId)}`, {
    dataItem: { data: item, id: item._id },
  });
}

export async function removeItem(itemId: string): Promise<void> {
  const { collectionId } = getWixConfig();
  await wixFetch(
    "DELETE",
    `/wix-data/v2/items/${encodeURIComponent(itemId)}?dataCollectionId=${encodeURIComponent(collectionId)}`,
  );
}

export interface WixQueryResponse {
  dataItems: { id: string; data: WixInventoryItem }[];
  pagingMetadata?: { count?: number };
}

export async function queryAll(): Promise<WixQueryResponse> {
  const { collectionId } = getWixConfig();
  return wixFetch<WixQueryResponse>("POST", `/wix-data/v2/items/query`, {
    dataCollectionId: collectionId,
    query: { paging: { limit: 1000 } },
  });
}
