/**
 * worker/catalog-sync.ts
 *
 * Refreshes the read-only LesPAC snapshot every CATALOG_SYNC_INTERVAL_SEC.
 * Independent of the mirror bot: that approach was abandoned, this one feeds the
 * public website.
 *
 * `--once` runs a single cycle and exits (used by `pnpm catalog:sync`).
 */

import { runCatalogSync } from "@/lib/catalog/snapshot";
import { createAdminClient } from "@/lib/supabase/admin";

const INTERVAL_SEC = Number.parseInt(process.env.CATALOG_SYNC_INTERVAL_SEC ?? "900", 10);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cycle(): Promise<void> {
  const supabase = createAdminClient();
  const r = await runCatalogSync(supabase);
  if (r.ok) {
    console.log(`[catalog-sync] ok — written=${r.written} sold=${r.sold}`);
  } else {
    console.error(`[catalog-sync] FAILED — snapshot kept — ${r.error}`);
  }
}

if (require.main === module) {
  const once = process.argv.includes("--once");
  let stopping = false;

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      console.log(`[catalog-sync] ${sig} — stopping after current cycle`);
      stopping = true;
    });
  }

  void (async () => {
    console.log(`[catalog-sync] up — interval=${INTERVAL_SEC}s once=${once}`);
    do {
      const started = Date.now();
      try {
        await cycle();
      } catch (err) {
        // Never let the loop die: the next cycle may well succeed.
        console.error("[catalog-sync] cycle threw:", err);
      }
      if (once || stopping) break;
      await sleep(Math.max(0, INTERVAL_SEC * 1000 - (Date.now() - started)));
    } while (!stopping);
    console.log("[catalog-sync] stopped cleanly.");
  })();
}
