# Patron SERTI — Notes d'adaptateur

Référence extraite de `/home/hino1/calendrier-service` (Node + Supabase + SERTI DB2/iSeries).
À reproduire dans le nouvel adaptateur SERTI de `/home/hino1/pacman` (Plan 1 Task 5).

Version de référence : `calendrier-service@3.18.0`.

---

## 1. Driver npm

- **Package** : `node-jt400`
- **Version déclarée dans `package.json`** : `^6.0.1`
- **Version installée (`node_modules/node-jt400/package.json`)** : `6.0.1`
- **Nature** : wrapper Node autour de la librairie Java IBM Toolbox for Java (JT400).
  Utilisé pour se connecter à IBM iSeries / AS/400 (OS400) et interroger DB2 for i.
- **Dépendance transitive clé** : `node-java` (binding Java natif).

> **Attention** : ce n'est pas un driver DB2 LUW classique (`ibm_db`, `odbc`). C'est
> un pont JDBC via JT400. Cela change tout au niveau des prérequis système (voir pièges).

---

## 2. Variables d'environnement attendues

Copiées verbatim du code (`server.js` lignes 142-156) et de `.env` :

| Variable          | Défaut codé en dur (fallback)        | Usage                                  |
|-------------------|--------------------------------------|----------------------------------------|
| `SERTI_DB2_HOST`  | `10.20.2.246`                        | Adresse IP de l'iSeries                |
| `SERTI_DB2_USER`  | `YANNICK`                            | Utilisateur iSeries (profil OS400)     |
| `SERTI_DB2_PASS`  | `SDS`                                | Mot de passe iSeries                   |
| `SDSWEB_USER`     | Fallback → `SERTI_DB2_USER`          | Client REST SDSWeb (Keyloop)           |
| `SDSWEB_PASS`     | Fallback → `SERTI_DB2_PASS`          | Client REST SDSWeb (Keyloop)           |

Notes :
- Le **schéma** DB2 `SDSFC` est codé en dur dans `SERTI_CONFIG` et dans chaque requête
  (`SELECT ... FROM SDSFC.SAM ...`). Pas de variable d'env pour ça.
- Les fallbacks hardcodés (`10.20.2.246`, `YANNICK`, `SDS`) servent de filet dev
  seulement — en prod les 3 `SERTI_DB2_*` sont obligatoires (voir `.env` actuel).
- Le credential iSeries sert aussi à SDSWeb (compte partagé sur le même iSeries).

---

## 3. Snippet de connexion (verbatim)

Import (`server.js` ligne 11) :

```typescript
const jt400 = require('node-jt400');
```

Configuration (`server.js` lignes 142-148) :

```typescript
const SERTI_CONFIG = {
  host:     process.env.SERTI_DB2_HOST || '10.20.2.246',
  user:     process.env.SERTI_DB2_USER || 'YANNICK',
  password: process.env.SERTI_DB2_PASS || 'SDS',
  schema:   'SDSFC',
};
let sertiPool = null;
```

Init du pool avec smoke-test + health check (`server.js` lignes 439-472) :

```typescript
async function initSERTIPool() {
  try {
    sertiPool = jt400.pool({
      host:     SERTI_CONFIG.host,
      user:     SERTI_CONFIG.user,
      password: SERTI_CONFIG.password,
      naming:   'sql',
      maxPoolSize: 8,
    });
    await sertiPool.query('SELECT 1 FROM SYSIBM.SYSDUMMY1');
    installSAMVerifyHook(sertiPool);
    log(`SERTI DB2 pool ready (${SERTI_CONFIG.host})`);
  } catch (err) {
    log(`SERTI DB2 init failed: ${err.message} — SERTI features disabled`);
    sertiPool = null;
  }
}

// Health check SERTI DB2 — reconnexion auto si le pool est mort
async function checkSERTIHealth() {
  try {
    if (!sertiPool) {
      log('SERTI health: pool is null, attempting reconnect...');
      await initSERTIPool();
      return;
    }
    await sertiPool.query('SELECT 1 FROM SYSIBM.SYSDUMMY1');
  } catch (err) {
    log(`SERTI health: pool dead (${err.message}), reconnecting...`);
    try { sertiPool.close && sertiPool.close(); } catch(_) {}
    sertiPool = null;
    await initSERTIPool();
  }
}
```

Branchement au démarrage (`server.js` lignes 9358 et 9439) :

```typescript
// Au boot
await initSERTIPool();

// Boucle de santé
setInterval(checkSERTIHealth, 5 * 60 * 1000);
```

---

## 4. Exemples de requêtes réelles

### 4.1 SELECT simple avec TRIM et JOIN (`lookupSERTIInfo`, server.js l. 1403-1408)

```typescript
const rows = await sertiPool.query(
  "SELECT TRIM(h.SADOC) AS BC, TRIM(h.SAAS#) AS CUST_CODE, TRIM(a.ADMNAM) CONCAT ' ' CONCAT TRIM(a.ADMXNA) AS CLIENT " +
  "FROM SDSFC.SAMH h LEFT JOIN SDSFC.ADM a ON TRIM(h.SAAS#) = TRIM(a.ADMADR) " +
  "WHERE TRIM(h.SADOC) = '" + bcNum.replace(/'/g, "''") + "' " +
  "GROUP BY h.SADOC, h.SAAS#, a.ADMNAM, a.ADMXNA FETCH FIRST 1 ROW ONLY"
);
```

### 4.2 UPDATE avec OVERLAY de bytes (packed decimal) (`writeSERTIMileage`, server.js l. 346-362)

```typescript
async function writeSERTIMileage(bcNum, km) {
  if (!sertiPool || !bcNum || !km || km <= 0) return false;
  try {
    // Packed decimal PK(7,0): 7 digits + sign nibble F = 4 octets
    const digits = String(Math.round(km)).padStart(7, '0');
    const hexStr = digits + 'F';
    await sertiPool.update(
      `UPDATE SDSFC.SAM SET SAMDTL = OVERLAY(SAMDTL PLACING X'${hexStr}' FROM 42 FOR 4) WHERE RIGHT(SAMKEY,4)='0002' AND TRIM(SUBSTR(SAMKEY,9,7))='${bcNum.replace(/'/g, "''")}'`
    );
    log(`writeSERTIMileage: ${bcNum} → ${km} km (hex: ${hexStr})`);
    return true;
  } catch(e) {
    log(`writeSERTIMileage error: ${e.message}`);
    return false;
  }
}
```

Retient :
- `pool.query(sql)` pour les SELECT (retourne un array d'objets lignes).
- `pool.update(sql)` pour INSERT / UPDATE / DELETE.
- Les chaînes sont concaténées directement dans le SQL — **pas de prepared
  statements** dans le code calendrier-service. L'échappement est fait
  manuellement avec `.replace(/'/g, "''")` et/ou `.replace(/[^A-Za-z0-9]/g, '')`.

---

## 5. Pièges connus

### 5.1 Prérequis système : JDK obligatoire (pas libdb2.so)

`node-jt400` s'appuie sur `node-java` → **il faut un JRE/JDK installé** sur la machine
qui roule Node. Sur Linux serveur, typiquement `default-jre-headless` ou OpenJDK.
Si Java est absent, l'installation de `node-java` échoue au `npm install` (node-gyp,
JNI headers). À tester en premier sur le serveur cible.

Pas besoin de `libdb2.so` / client DB2 Connect — JT400 parle le protocole iSeries
natif en pur Java via TCP.

### 5.2 Pool : taille 8, pas de timeout configuré

`maxPoolSize: 8` dans calendrier-service. Pas de `connectionTimeout` ni
`idleTimeout` explicites — les défauts JT400 JDBC s'appliquent. Si le pool meurt
(réseau, reboot iSeries), `checkSERTIHealth` le reconstruit toutes les 5 min.

### 5.3 `naming: 'sql'` indispensable

Sans cette option, JT400 utilise le nommage système OS400 (séparateur `/` :
`SDSFC/SAM`). Avec `naming: 'sql'`, on peut écrire `SDSFC.SAM` (nommage SQL
standard). Tout le code calendrier assume `naming: 'sql'`.

### 5.4 Colonnes CHAR auto-rtrim au SELECT

Commentaire explicite (`server.js` l. 396) :
> `node-jt400 rtrim les CHAR columns au SELECT — compare après rtrim en mode text.`

Si on relit un CHAR à largeur fixe et qu'on compare octet-à-octet avec ce qu'on a
écrit, il faut soit utiliser `HEX(SUBSTR(...))` pour forcer une lecture binaire
stricte, soit `rtrim()` côté JS la valeur attendue.

### 5.5 Init ne throw pas : SERTI features désactivés en silence

`initSERTIPool` attrape l'erreur et loggue `SERTI DB2 init failed: ... — SERTI
features disabled`. `sertiPool` reste `null`. Chaque fonction qui l'utilise doit
vérifier `if (!sertiPool) return …`. C'est intentionnel (l'app continue même si
l'iSeries est down), mais il faut reproduire ce garde-fou partout dans le nouvel
adaptateur, sinon erreurs `Cannot read properties of null`.

### 5.6 Packed decimal + OVERLAY : attention aux bytes

Les champs `SAM.SAMDTL` contiennent des données fixed-width incluant des packed
decimals. Exemples :
- Kilométrage : `PK(7,0)` = 7 digits + sign nibble `F` = 4 octets, à la position 42.
- Quantité : `PK(5,2)` = 3 octets, sign `F` pour positif non-signé (`packDecimal52`,
  server.js l. 195-199).

Pour écrire : `UPDATE ... OVERLAY(SAMDTL PLACING X'${hexStr}' FROM pos FOR len)`.
Pour lire : `HEX(SUBSTR(SAMDTL, pos, len))` puis parse manuel (strip du dernier
nibble = signe).

Un hook de vérification read-back (`installSAMVerifyHook`, l. 423-437) intercepte
chaque `pool.update(sql)`, relit les bytes écrits, et envoie un courriel d'alerte
si divergence (`DIVERGENCE_PREFIX = 'SAMDTL_DIVERGENCE '`). Pattern à garder si
on fait des writes dans SAMDTL.

### 5.7 Pas de paramètres liés — attention à l'injection SQL

Tout le code construit des chaînes SQL par concaténation. L'échappement est
manuel, typiquement :
- Strings : `.replace(/'/g, "''")` (doubler les apostrophes).
- IDs de BC : `.replace(/[^A-Za-z0-9]/g, '')` (whitelist stricte).

Le nouvel adaptateur devrait soit :
1. Suivre le même pattern avec helpers `escSql(str)` + whitelist regex centralisés.
2. Préférablement, utiliser des prepared statements JT400 (`pool.execute(sql,
   params)` existe dans l'API — non utilisé dans calendrier-service).

### 5.8 Locks applicatifs en mémoire (`sertiEditLock`)

calendrier-service maintient un lock in-process `sertiEditLock[bc] = timestamp`
avec TTL 2 min (`SERTI_LOCK_TTL`, l. 158-192) pour empêcher les éditions
concurrentes sur un même BC. **Ce lock n'est pas partagé** — si le nouvel adapter
tourne dans un autre process (Next.js), il faut coordonner via Redis/Supabase,
sinon race possible entre les deux services.

### 5.9 Caches DB2 multicouches

`lookupSERTIInfo` a un cache deux niveaux : mémoire (`_sertiInfoCache`) + Redis
(`cache.getJson('serti:' + bcNum)`) avec TTL 1 h. Raison explicite (l. 1390) :
> « évite 4 requêtes DB2 par BC à chaque sync »

Chaque `query()` sur l'iSeries est coûteuse (latence JDBC + bridge Java).
Penser cache dès le départ dans le nouvel adaptateur.

### 5.10 Schéma partagé `SDSFC` — tables clés

Tables fréquemment requêtées dans calendrier-service (utile pour tester la
connexion) :
- `SDSFC.SAM` — détails BC (header vehicle à `RIGHT(SAMKEY,4)='0002'`)
- `SDSFC.SAMH` — BCs historiques fermés
- `SDSFC.SAMB` — BCs actifs
- `SDSFC.SAMF` — opérations / poinçons
- `SDSFC.ADM` — clients (`ADMADR` = code client)
- `SDSFC.VEM` — véhicules (`VEMVIN`, `VEMADR`, `VEMMAK`, `VEMMOD`, `VEMYEA`)
- `SDSFC.TPU` — temps poinçonnés par technicien

Smoke test universel : `SELECT 1 FROM SYSIBM.SYSDUMMY1` (dual de DB2 for i).

---

## 6. Checklist pour Task 5

- [ ] `npm i node-jt400@^6.0.1`
- [ ] Vérifier Java installé sur l'environnement cible (`java -version`)
- [ ] Lire `SERTI_DB2_HOST` / `SERTI_DB2_USER` / `SERTI_DB2_PASS` depuis `process.env`
  avec les **mêmes noms de variables** (pas de refactor — l'équipe SERTI maintient
  les deux services)
- [ ] Pool avec `naming: 'sql'`, `maxPoolSize: 8`
- [ ] Smoke test post-init : `SELECT 1 FROM SYSIBM.SYSDUMMY1`
- [ ] Health check périodique (`setInterval`, 5 min)
- [ ] Garde `if (!pool) return null` sur toute fonction publique
- [ ] Échappement SQL centralisé (helpers) OU passage aux prepared statements
- [ ] Schéma `SDSFC` en dur (ou constante, pas env)
- [ ] Cache TTL pour les lookups fréquents (mémoire + Redis/Supabase)
