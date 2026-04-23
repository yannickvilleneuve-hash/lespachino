import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GRAPH_TENANT, GRAPH_CLIENT, GRAPH_SECRET, GRAPH_FROM } = process.env;

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = "yannick.villeneuve@gmail.com";
const origin = "http://hino1-thinkcentre-m93p.tail0e1ea8.ts.net:3005";

console.log("1. generateLink...");
const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: `${origin}/auth/callback` },
});
if (error) { console.error("generateLink fail:", error); process.exit(1); }
const link = data.properties.action_link;
console.log("   OK, link:", link.slice(0, 80) + "...");

console.log("2. Graph token...");
const body = new URLSearchParams({
  client_id: GRAPH_CLIENT,
  scope: "https://graph.microsoft.com/.default",
  client_secret: GRAPH_SECRET,
  grant_type: "client_credentials",
});
const tokResp = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: body.toString(),
});
if (!tokResp.ok) { console.error("token fail:", await tokResp.text()); process.exit(1); }
const { access_token } = await tokResp.json();
console.log("   OK token acquired");

console.log("3. Graph sendMail...");
const message = {
  subject: `[TEST ${new Date().toLocaleTimeString("fr-CA")}] Magic link via Graph`,
  body: { contentType: "HTML", content: `<p>Test du flow B.2 à ${new Date().toISOString()}</p><p><a href="${link}">Cliquer ici pour se connecter</a></p>` },
  toRecipients: [{ emailAddress: { address: email } }],
};
const sendResp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(GRAPH_FROM)}/sendMail`, {
  method: "POST",
  headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ message, saveToSentItems: true }),
});
if (!sendResp.ok) { console.error("sendMail fail:", sendResp.status, await sendResp.text()); process.exit(1); }
console.log("   OK sent to", email);
