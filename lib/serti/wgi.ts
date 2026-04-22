import { query, queryOne } from "./client";

export interface Vehicle {
  vin: string;
  unit: string;
  make: string;
  model: string;
  year: number;
  km: number;
  category: string;
  status: "A" | "S" | "R" | string;
  color: string;
  /** Coûtant interne (WGICST). Ne JAMAIS exposer au catalogue public. */
  cost: number;
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
}

const SELECT_COLS =
  "WGISER, WGIUNM, WGIMKE, WGIMDL, WGIYEA, WGIODM, WGICAT, WGISTA, WGICLD, WGICST";

function s(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function n(v: string | null | undefined): number {
  const t = s(v);
  if (!t) return 0;
  const parsed = Number(t);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRow(row: WgiRow): Vehicle {
  return {
    vin: s(row.WGISER),
    unit: s(row.WGIUNM),
    make: s(row.WGIMKE),
    model: s(row.WGIMDL),
    year: n(row.WGIYEA),
    km: n(row.WGIODM),
    category: s(row.WGICAT),
    status: s(row.WGISTA),
    color: s(row.WGICLD),
    cost: n(row.WGICST),
  };
}

export async function getVehicleByVin(vin: string): Promise<Vehicle | null> {
  const row = await queryOne<WgiRow>(
    `SELECT ${SELECT_COLS} FROM SDSFC.WGI WHERE TRIM(WGISER) = ?`,
    [vin.trim()],
  );
  return row ? mapRow(row) : null;
}

export async function getVehicleByUnit(unit: string): Promise<Vehicle | null> {
  const row = await queryOne<WgiRow>(
    `SELECT ${SELECT_COLS} FROM SDSFC.WGI WHERE TRIM(WGIUNM) = ?`,
    [unit.trim()],
  );
  return row ? mapRow(row) : null;
}

export async function listActiveVehicles(): Promise<Vehicle[]> {
  const rows = await query<WgiRow>(
    `SELECT ${SELECT_COLS} FROM SDSFC.WGI WHERE WGISTA = 'A' ORDER BY WGIUNM`,
  );
  return rows.map(mapRow);
}
