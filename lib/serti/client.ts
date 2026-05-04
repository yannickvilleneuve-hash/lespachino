import * as jt400 from "node-jt400";

type Pool = ReturnType<typeof jt400.pool>;
let poolInstance: Pool | null = null;

function resetPool(): void {
  const pool = poolInstance as (Pool & { close?: () => unknown }) | null;
  poolInstance = null;
  try {
    pool?.close?.();
  } catch {
    // Best-effort seulement; la prochaine requête recréera le pool.
  }
}

function getPool(): Pool {
  if (poolInstance) return poolInstance;
  const { SERTI_DB2_HOST, SERTI_DB2_USER, SERTI_DB2_PASS } = process.env;
  if (!SERTI_DB2_HOST || !SERTI_DB2_USER || !SERTI_DB2_PASS) {
    throw new Error("SERTI_DB2_HOST / SERTI_DB2_USER / SERTI_DB2_PASS requis");
  }
  poolInstance = jt400.pool({
    host: SERTI_DB2_HOST,
    user: SERTI_DB2_USER,
    password: SERTI_DB2_PASS,
    naming: "sql",
    maxPoolSize: 8,
  });
  return poolInstance;
}

export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const pool = getPool();
  try {
    const rows = (await pool.query(sql, params as never)) as T[];
    return rows[0] ?? null;
  } catch (err) {
    resetPool();
    throw err;
  }
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool();
  try {
    return (await pool.query(sql, params as never)) as T[];
  } catch (err) {
    resetPool();
    throw err;
  }
}

export async function sertiHealthCheck(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1 FROM SYSIBM.SYSDUMMY1");
    return true;
  } catch {
    resetPool();
    return false;
  }
}
