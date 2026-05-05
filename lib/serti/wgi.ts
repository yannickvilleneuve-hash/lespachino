import { query, queryOne } from "./client";

export type SertiStatus = "available" | "quoted" | "sold";

export interface Vehicle {
  vin: string;
  unit: string;
  make: string;
  model: string;
  year: number;
  km: number;
  category: string;
  /** Code SERTI brut (`A`/`R`/`S`). */
  status_raw: string;
  /** Statut normalisé. `A`→available, `R`→quoted, `S`→sold. */
  status: SertiStatus;
  color: string;
  /** Coûtant interne (WGICST). Ne JAMAIS exposer au catalogue public. */
  cost: number;
  /** Date du dernier changement de la disponibilité (WGIDAV, ISO `YYYY-MM-DD`).
   *  En pratique = date d'arrivée pour les unités encore au lot. */
  date_added: string | null;
  /** Vrai si physiquement présent au lot (WGIAVL='1'). Faux si livré/archivé. */
  available: boolean;
  /** Code brut WGIAVL (`1` = au lot, `2` = livré). */
  avail_raw: string;
  /** Commentaire de disponibilité libre saisi par le vendeur (WGIAVC). */
  avail_comment: string;
}

export interface CostTransaction {
  id: string;
  date: string | null;
  invoice: string;
  debit_credit: string;
  gl_account: string;
  amount: number;
  description: string;
  address_number: string;
  stock_number: string;
  type: string;
  batch_number: number;
}

interface WgiRow {
  WGISER: string;
  WGIUNM: string;
  WGIMKE: string;
  WGIMDL: string;
  WGIYEA: string;
  WGIODM: string;
  WGICAT: string;
  WGISTA: string;
  WGICLD: string;
  WGICST: string;
  WGIDAV: string;
  WGIAVL: string;
  WGIAVC: string;
}

interface WgaRow {
  WGAID: string;
  WGADAT: string;
  WGAINV: string;
  WGADCI: string;
  WGAGLA: string;
  WGAAMT: string;
  WGADES: string;
  WGAADR: string;
  WGASTK: string;
  WGANUM: string;
  WGATYP: string;
  WGASTP: string;
  WGARAN: string;
}

const SELECT_COLS =
  "WGISER, WGIUNM, WGIMKE, WGIMDL, WGIYEA, WGIODM, WGICAT, WGISTA, WGICLD, WGICST, WGIDAV, WGIAVL, WGIAVC";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheTtlMs(): number {
  if (process.env.NODE_ENV === "test") return 0;
  const parsed = Number(process.env.SERTI_CACHE_TTL_MS ?? "60000");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const ttl = cacheTtlMs();
  if (ttl <= 0) return load();
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await load();
  cache.set(key, { value, expiresAt: now + ttl });
  return value;
}

export function clearSertiCache(): void {
  cache.clear();
}

function s(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function n(v: string | null | undefined): number {
  const t = s(v);
  if (!t) return 0;
  const parsed = Number(t);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseYyyymmdd(v: string | null | undefined): string | null {
  const t = s(v);
  if (!t || t === "0" || t === "00000000") return null;
  if (!/^\d{8}$/.test(t)) return null;
  const y = t.slice(0, 4);
  const m = t.slice(4, 6);
  const d = t.slice(6, 8);
  if (y === "0000" || m === "00" || d === "00") return null;
  return `${y}-${m}-${d}`;
}

function signedAmount(amount: number, debitCredit: string): number {
  return debitCredit.trim().toUpperCase() === "C" ? -amount : amount;
}

export function normalizeSertiStatus(raw: string): SertiStatus {
  const t = (raw ?? "").trim().toUpperCase();
  if (t === "S") return "sold";
  if (t === "R") return "quoted";
  return "available";
}

function mapCostTransaction(row: WgaRow): CostTransaction {
  const debitCredit = s(row.WGADCI);
  return {
    id: s(row.WGAID),
    date: parseYyyymmdd(row.WGADAT),
    invoice: s(row.WGAINV),
    debit_credit: debitCredit,
    gl_account: s(row.WGAGLA),
    amount: signedAmount(n(row.WGAAMT), debitCredit),
    description: s(row.WGADES),
    address_number: s(row.WGAADR),
    stock_number: s(row.WGASTK) || s(row.WGANUM),
    type: s(row.WGATYP),
    batch_number: n(row.WGASTP),
  };
}

function mapRow(row: WgiRow): Vehicle {
  const raw = s(row.WGISTA);
  const availRaw = s(row.WGIAVL);
  return {
    vin: s(row.WGISER),
    unit: s(row.WGIUNM),
    make: s(row.WGIMKE),
    model: s(row.WGIMDL),
    year: n(row.WGIYEA),
    km: n(row.WGIODM),
    category: s(row.WGICAT),
    status_raw: raw,
    status: normalizeSertiStatus(raw),
    color: s(row.WGICLD),
    cost: n(row.WGICST),
    date_added: parseYyyymmdd(row.WGIDAV),
    available: availRaw === "1",
    avail_raw: availRaw,
    avail_comment: s(row.WGIAVC),
  };
}

export async function getVehicleByVin(vin: string): Promise<Vehicle | null> {
  const key = `vin:${vin.trim().toUpperCase()}`;
  return cached(key, async () => {
    const row = await queryOne<WgiRow>(
      `SELECT ${SELECT_COLS} FROM SDSFC.WGI WHERE TRIM(WGISER) = ?`,
      [vin.trim()],
    );
    return row ? mapRow(row) : null;
  });
}

export async function getVehicleByUnit(unit: string): Promise<Vehicle | null> {
  const key = `unit:${unit.trim().toUpperCase()}`;
  return cached(key, async () => {
    const row = await queryOne<WgiRow>(
      `SELECT ${SELECT_COLS} FROM SDSFC.WGI WHERE TRIM(WGIUNM) = ?`,
      [unit.trim()],
    );
    return row ? mapRow(row) : null;
  });
}

/** Transactions de coûtant d'une unité. Leur somme correspond au coûtant WGI.WGICST. */
export async function getCostTransactionsByUnit(unit: string): Promise<CostTransaction[]> {
  const key = `cost:${unit.trim().toUpperCase()}`;
  return cached(key, async () => {
    const rows = await query<WgaRow>(
      `SELECT WGAID, WGADAT, WGAINV, WGADCI, WGAGLA, WGAAMT, WGADES, WGAADR,
              WGASTK, WGANUM, WGATYP, WGASTP, WGARAN
       FROM SDSFC.WGA
       WHERE TRIM(WGASTK) = ? OR TRIM(WGANUM) = ?
       ORDER BY WGADAT, WGARAN`,
      [unit.trim(), unit.trim()],
    );
    return rows.map(mapCostTransaction);
  });
}

/** Véhicules vraiment disponibles à la vente: WGISTA='A' ET physiquement
 *  présents (WGIAVL='1'). Utiliser pour les compteurs de stock dispo. */
export async function listActiveVehicles(): Promise<Vehicle[]> {
  return cached("list:active", async () => {
    const rows = await query<WgiRow>(
      `SELECT ${SELECT_COLS} FROM SDSFC.WGI
       WHERE WGISTA = 'A' AND WGIAVL = '1'
       ORDER BY WGIUNM`,
    );
    return rows.map(mapRow);
  });
}

/** Inventaire admin: tout ce qui est physiquement au lot (WGIAVL='1').
 *  Inclut A (dispo), R (en soumission), S (vendu mais pas encore livré).
 *  Quand SERTI bascule WGIAVL='2' (livré), l'unité disparaît automatiquement. */
export async function listInventoryVehicles(): Promise<Vehicle[]> {
  return cached("list:inventory", async () => {
    const rows = await query<WgiRow>(
      `SELECT ${SELECT_COLS} FROM SDSFC.WGI
       WHERE WGIAVL = '1'
       ORDER BY WGIUNM`,
    );
    return rows.map(mapRow);
  });
}
