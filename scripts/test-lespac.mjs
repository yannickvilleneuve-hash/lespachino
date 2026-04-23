// Ping l'API Lespac — vérifie que la clé + le base URL fonctionnent.
// Usage: node --env-file=.env.local scripts/test-lespac.mjs
//
// Utilise ws.lespacstaging.com si LESPAC_API_BASE pointe vers staging.
// GET /sell-api/v1.0/listings → liste les annonces actuelles du compte.

const { LESPAC_API_TOKEN, LESPAC_API_BASE = "https://ws.lespac.com" } = process.env;
if (!LESPAC_API_TOKEN) {
  console.error("LESPAC_API_TOKEN manquant dans .env.local");
  process.exit(1);
}

const url = `${LESPAC_API_BASE.replace(/\/+$/, "")}/sell-api/v1.0/listings`;
console.log(`GET ${url}`);
const res = await fetch(url, {
  headers: {
    Authorization: `LPC token="${LESPAC_API_TOKEN}"`,
    Accept: "application/json",
  },
});

console.log(`HTTP ${res.status}`);
const ct = res.headers.get("content-type") ?? "";
const body = await res.text();
if (ct.includes("json") && body) {
  try {
    const json = JSON.parse(body);
    const arr = Array.isArray(json) ? json : (json.listings ?? json);
    console.log(`Annonces trouvées: ${Array.isArray(arr) ? arr.length : "(structure inconnue)"}`);
    if (Array.isArray(arr) && arr.length > 0) {
      console.log("Exemple:", JSON.stringify(arr[0], null, 2).slice(0, 600));
    }
  } catch {
    console.log(body.slice(0, 800));
  }
} else {
  console.log(body.slice(0, 800));
}

if (!res.ok) process.exit(1);
