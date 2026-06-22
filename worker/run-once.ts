/**
 * worker/run-once.ts
 *
 * Runs a single sync cycle and exits (used by `pnpm bot:cycle` + the dashboard
 * "Sync now" action). Safe to import without executing the cycle — the
 * `require.main === module` guard prevents auto-run on import.
 */

import { runCycle } from "@/lib/bot/cycle";

// Guard: only run when this file is the entry point (not imported by tests).
if (require.main === module) {
  async function main(): Promise<void> {
    const started = Date.now();
    const summary = await runCycle();
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[bot] cycle done in ${secs}s — listings=${summary.listings} jobs=${summary.jobs} ` +
        `ok=${summary.succeeded} failed=${summary.failed} dead=[${summary.sessionsDead.join(",")}]`,
    );
  }

  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[bot] run-once failed:", err);
      process.exit(1);
    });
}
