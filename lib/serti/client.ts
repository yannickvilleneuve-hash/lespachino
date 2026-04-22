import * as jt400 from "node-jt400";

type Pool = ReturnType<typeof jt400.pool>;
let poolInstance: Pool | null = null;

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
  const rows = (await pool.query(sql, params as never)) as T[];
  return rows[0] ?? null;
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool();
  return (await pool.query(sql, params as never)) as T[];
}

export async function sertiHealthCheck(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1 FROM SYSIBM.SYSDUMMY1");
    return true;
  } catch {
    return false;
  }
}
