/**
 * worker/index.ts
 *
 * Long-running scheduler: calls runCycle() every syncIntervalSec.
 * Catches + logs errors so the loop never dies.
 * Graceful shutdown on SIGINT / SIGTERM (finishes the current cycle first).
 */

import { runCycle } from "@/lib/bot/cycle";
import { loadBotConfig } from "@/lib/bot/config";

// Guard: only run when this file is the entry point (not imported by tests).
if (require.main === module) {
  let stopping = false;

  async function loop(): Promise<void> {
    const cfg = loadBotConfig();
    console.log(
      `[bot] scheduler up — interval=${cfg.syncIntervalSec}s platforms=[${cfg.enabledPlatforms.join(",")}]`,
    );
    while (!stopping) {
      const started = Date.now();
      try {
        const summary = await runCycle();
        console.log(
          `[bot] cycle ok — jobs=${summary.jobs} ok=${summary.succeeded} ` +
            `failed=${summary.failed} dead=[${summary.sessionsDead.join(",")}]`,
        );
      } catch (err) {
        // Never let the loop die on an unexpected throw.
        console.error("[bot] cycle threw:", err);
      }
      const elapsed = Date.now() - started;
      const wait = Math.max(0, cfg.syncIntervalSec * 1000 - elapsed);
      await sleep(wait);
    }
    console.log("[bot] scheduler stopped cleanly.");
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      console.log(`[bot] ${sig} — stopping after current cycle`);
      stopping = true;
    });
  }

  loop().catch((err) => {
    console.error("[bot] scheduler crashed:", err);
    process.exit(1);
  });
}
