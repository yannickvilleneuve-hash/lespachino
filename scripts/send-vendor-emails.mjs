// Envoi 3 courriels débloqueurs (Kijiji, Lespac, TRADER) via Graph API.
// Usage: node --env-file=.env.local scripts/send-vendor-emails.mjs

const TENANT = process.env.GRAPH_TENANT;
const CLIENT = process.env.GRAPH_CLIENT;
const SECRET = process.env.GRAPH_SECRET;
const FROM = process.env.GRAPH_FROM;
const CC = "yannick.villeneuve@gmail.com";

if (!TENANT || !CLIENT || !SECRET || !FROM) {
  console.error("GRAPH_TENANT/CLIENT/SECRET/FROM requis");
  process.exit(1);
}

async function getToken() {
  const body = new URLSearchParams({
    client_id: CLIENT,
    scope: "https://graph.microsoft.com/.default",
    client_secret: SECRET,
    grant_type: "client_credentials",
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

async function send({ to, subject, html, token }) {
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(FROM)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        ccRecipients: [{ emailAddress: { address: CC } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!r.ok) throw new Error(`send to ${to} ${r.status}: ${await r.text()}`);
}

const sig = `<p>— Yannick Villeneuve<br>Centre du camion Hino<br>418-612-0525</p>`;
const wrap = (body) =>
  `<div style="font-family:Arial,sans-serif;max-width:560px;color:#222;font-size:14px;line-height:1.5">${body}${sig}</div>`;

const emails = [
  {
    to: "dealers@kijiji.ca",
    subject: "Demande spec XML feed integration — concessionnaire existant",
    html: wrap(`
<p>Bonjour,</p>
<p>Je suis responsable du département ventes chez Centre du camion Hino — concessionnaire dealer.</p>
<p>On développe notre propre système de gestion d'inventaire et on aimerait alimenter nos annonces Kijiji par flux XML automatique plutôt que par saisie manuelle.</p>
<p>Pouvez-vous me transmettre&nbsp;:</p>
<ol>
<li>La spécification technique officielle de votre feed XML dealer (schema XSD + exemple complet)</li>
<li>L'URL où Kijiji pulle le feed (ou le flow d'upload)</li>
<li>Les prérequis d'onboarding et délais typiques</li>
<li>Si un frais additionnel est associé à l'intégration feed (vs. saisie Dealer Central)</li>
</ol>
<p>Volume&nbsp;: ~70 véhicules actifs, catégories camions commerciaux neufs/usagés + boîtes + remorques. Je peux fournir nos credentials dealer si utile.</p>
<p>Merci&nbsp;!</p>`),
  },
  {
    to: "contact@lespac.com",
    subject: "Partenariat concessionnaire + feed XML inventaire",
    html: wrap(`
<p>Bonjour,</p>
<p>Centre du camion Hino est concessionnaire de camions commerciaux. On bâtit un système de gestion d'inventaire interne et on aimerait publier automatiquement nos véhicules sur Lespac via flux XML, plutôt que par saisie manuelle.</p>
<p>Pouvez-vous me transmettre&nbsp;:</p>
<ol>
<li>Les options d'abonnement dealer incluant le feed automatique</li>
<li>La spécification du flux XML (schema + exemple)</li>
<li>Pricing mensuel</li>
<li>Les catégories supportées (camions commerciaux, boîtes, remorques)</li>
</ol>
<p>Volume prévu&nbsp;: ~70 véhicules actifs.</p>
<p>Si Lespac est maintenant géré via TRADER AutoSync, merci de me rediriger au bon contact.</p>
<p>Merci&nbsp;!</p>`),
  },
  {
    to: "info@tradercorporation.com",
    subject: "Demande de devis AutoSync — concessionnaire camions commerciaux",
    html: wrap(`
<p>Bonjour,</p>
<p>Centre du camion Hino — concessionnaire camions commerciaux Hino — évalue un outil de syndication d'inventaire. J'aimerais un devis AutoSync.</p>
<p><strong>Questions&nbsp;:</strong></p>
<ol>
<li>Quel package couvre syndication vers AutoTrader.ca + Lespac + Kijiji (3 canaux essentiels)&nbsp;?</li>
<li>Camions commerciaux (Hino, boîtes, remorques) supportés avec mêmes features que voitures passagers&nbsp;?</li>
<li>Pricing mensuel pour ~70 véhicules actifs (mix neufs/usagés)&nbsp;?</li>
<li>Format feed d'entrée accepté&nbsp;: on a un flux JSON custom + XML standard. Vous l'acceptez ou faut transformer&nbsp;?</li>
<li>Support photos&nbsp;: max par véhicule&nbsp;? URL externes acceptées&nbsp;?</li>
<li>Engagement&nbsp;: mensuel ou annuel&nbsp;?</li>
<li>Délai entre sign-up et live sur les 3 plateformes&nbsp;?</li>
<li>Module CRM / leads unifié inclus&nbsp;?</li>
</ol>
<p><strong>Contexte&nbsp;:</strong></p>
<ul>
<li>~70 véhicules actifs (mix neufs/usagés Hino + boîtes + remorques)</li>
<li>DMS actuel&nbsp;: SERTI iSeries (extraction côté nous)</li>
<li>Photos hébergées chez nous (Supabase Storage, URLs publiques)</li>
<li>Pas besoin de site vitrine — on a le nôtre</li>
</ul>
<p>Merci de me transmettre une proposition écrite plutôt qu'un appel.</p>`),
  },
];

const token = await getToken();
console.log("Token OK. Envoi de", emails.length, "courriels...");
for (const e of emails) {
  try {
    await send({ ...e, token });
    console.log(`  ✓ ${e.to}`);
  } catch (err) {
    console.error(`  ✗ ${e.to}: ${err.message}`);
  }
}
