/**
 * Google Merchant Center — force fetch immédiat du feed via Content API.
 *
 * Au lieu d'attendre le pull quotidien programmé, on POST sur
 * /datafeeds/{datafeedId}/fetchnow pour forcer Google à re-télécharger
 * le feed `feeds.hinochicoutimi.com/feed/vehicles.xml` maintenant.
 *
 * Auth: Service Account JSON key (Google Cloud) avec rôle "Content API"
 * sur le compte Merchant Center 5775886419.
 */

export type GooglePushResult =
  | { action: "skipped"; reason: string }
  | { action: "triggered" }
  | { action: "error"; error: string };

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(key: ServiceAccountKey): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/content",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const { createSign } = await import("crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(key.private_key).toString("base64url");
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!resp.ok) throw new Error(`google token ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

export async function triggerGoogleFeedRefresh(): Promise<GooglePushResult> {
  const merchantId = process.env.GOOGLE_MERCHANT_ID;
  const datafeedId = process.env.GOOGLE_DATAFEED_ID;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!merchantId || !datafeedId || !keyJson) {
    return {
      action: "skipped",
      reason: "GOOGLE_MERCHANT_ID, GOOGLE_DATAFEED_ID ou GOOGLE_SERVICE_ACCOUNT_KEY absent",
    };
  }
  try {
    const key = JSON.parse(keyJson) as ServiceAccountKey;
    const token = await getAccessToken(key);
    const resp = await fetch(
      `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/datafeeds/${datafeedId}/fetchNow`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok) {
      const body = await resp.text();
      return { action: "error", error: `${resp.status}: ${body.slice(0, 200)}` };
    }
    return { action: "triggered" };
  } catch (err) {
    return { action: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export function isGooglePushReady(): boolean {
  return Boolean(
    process.env.GOOGLE_MERCHANT_ID &&
      process.env.GOOGLE_DATAFEED_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  );
}
