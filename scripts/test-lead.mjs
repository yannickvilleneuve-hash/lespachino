// Simule le server action submitLead côté node (pour tester sans Chrome).
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GRAPH_TENANT, GRAPH_CLIENT, GRAPH_SECRET, GRAPH_FROM } = process.env;

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Insert lead row
const lead = {
  unit: "B4210",
  name: "Client Test",
  phone: "514-555-0199",
  email: "test@example.com",
  message: "Test de la chaîne lead → email. Ignore ce message.",
  ip_hash: crypto.createHash("sha256").update("127.0.0.1").digest("hex").slice(0, 32),
  user_agent: "test-script/1.0",
};
console.log("1. Insert lead row...");
const { data: ins, error: insErr } = await admin.from("lead").insert(lead).select().single();
if (insErr) { console.error("insert fail:", insErr); process.exit(1); }
console.log("   OK lead id:", ins.id);

// 2. List auth users for CC
console.log("2. List auth users for CC...");
const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
const authEmails = users.users.map(u => u.email).filter(Boolean);
console.log("   CC targets:", authEmails);

// 3. Graph token + sendMail
console.log("3. Graph sendMail to service@ + CC...");
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
const { access_token } = await tokResp.json();

const to = GRAPH_FROM;
const cc = authEmails.filter(e => e.toLowerCase() !== to.toLowerCase());
const html = `<h3>Lead TEST pour ${lead.unit}</h3>
<p><strong>${lead.name}</strong> — ${lead.phone} / ${lead.email}</p>
<p>${lead.message}</p>
<p style="color:#888;font-size:12px">row id: ${ins.id}</p>`;

const sendResp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(GRAPH_FROM)}/sendMail`, {
  method: "POST",
  headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    message: {
      subject: `[TEST] Lead ${lead.unit} — ${lead.name}`,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
      ccRecipients: cc.map(e => ({ emailAddress: { address: e } })),
    },
    saveToSentItems: true,
  }),
});
if (!sendResp.ok) { console.error("sendMail fail:", sendResp.status, await sendResp.text()); process.exit(1); }
console.log(`   OK sent — to=${to}, cc=${cc.join(",")}`);
