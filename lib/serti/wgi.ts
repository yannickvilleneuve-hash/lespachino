import { queryOne } from "./client";

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

export async function getVehicleByVin(vin: string): Promise<Vehicle | null> {
  const row = await queryOne<WgiRow>(
    "SELECT WGISER, WGIUNM, WGIMKE, WGIMDL, WGIYEA, WGIODM, WGICAT, WGISTA, WGICLD FROM SDSFC.WGI WHERE TRIM(WGISER) = ?",
    [vin.trim()],
  );
  if (!row) return null;
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
  };
}
