export interface WixConfig {
  token: string;
  siteId: string;
  collectionId: string;
}

export function getWixConfig(): WixConfig {
  const token = process.env.WIX_API_TOKEN;
  const siteId = process.env.WIX_SITE_ID;
  const collectionId = process.env.WIX_INVENTORY_COLLECTION_ID ?? "Inventaire";
  if (!token) throw new Error("WIX_API_TOKEN requis");
  if (!siteId) throw new Error("WIX_SITE_ID requis");
  return { token, siteId, collectionId };
}

export function isWixReady(): boolean {
  try {
    getWixConfig();
    return true;
  } catch {
    return false;
  }
}
