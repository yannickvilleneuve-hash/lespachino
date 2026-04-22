/**
 * Microsoft Graph email sender — OAuth2 client_credentials.
 * Pattern repris de calendrier-service server.js l.2045-2099.
 */

const TOKEN_URL = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const tenant = process.env.GRAPH_TENANT;
  const clientId = process.env.GRAPH_CLIENT;
  const secret = process.env.GRAPH_SECRET;
  if (!tenant || !clientId || !secret) {
    throw new Error("GRAPH_TENANT / GRAPH_CLIENT / GRAPH_SECRET requis");
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    scope: "https://graph.microsoft.com/.default",
    client_secret: secret,
    grant_type: "client_credentials",
  });

  const resp = await fetch(TOKEN_URL(tenant), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph token ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

export interface GraphEmail {
  to: string | string[];
  subject: string;
  html: string;
  cc?: string[];
}

export async function sendGraphEmail({ to, subject, html, cc }: GraphEmail): Promise<void> {
  const from = process.env.GRAPH_FROM;
  if (!from) throw new Error("GRAPH_FROM requis");
  const token = await getAccessToken();

  const message: Record<string, unknown> = {
    subject,
    body: { contentType: "HTML", content: html },
    toRecipients: (Array.isArray(to) ? to : [to]).map((addr) => ({
      emailAddress: { address: addr },
    })),
  };
  if (cc && cc.length > 0) {
    message.ccRecipients = cc.map((addr) => ({ emailAddress: { address: addr } }));
  }

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph sendMail ${resp.status}: ${text.slice(0, 300)}`);
  }
}
