import { describe, it, expect } from "vitest";
import { watchdogHealth, WATCHDOG_SILENT_SEC, type WatchdogRow } from "@/lib/watchdog/status";

const now = new Date("2026-07-22T12:00:00Z");
const row = (o: Partial<WatchdogRow> = {}): WatchdogRow => ({
  ran_at: "2026-07-22T11:55:00Z", verdict: "OK", detail: null,
  feed_status: 200, feed_included: 19, feed_source: "live", ...o,
});

describe("watchdogHealth", () => {
  it("vert quand le chien de garde vient de passer et ne voit rien", () => {
    expect(watchdogHealth(row(), now).health).toBe("ok");
  });

  it("alerte quand il a vu quelque chose", () => {
    expect(watchdogHealth(row({ verdict: "FEED_DOWN" }), now).health).toBe("alerte");
  });

  it("muet quand c'est LUI qui s'est arrêté", () => {
    const vieux = new Date(now.getTime() - (WATCHDOG_SILENT_SEC + 60) * 1000).toISOString();
    // Un surveillant arrêté ne doit pas se lire comme un pipeline en santé.
    expect(watchdogHealth(row({ ran_at: vieux }), now).health).toBe("muet");
  });

  it("inconnu sans aucun passage, jamais vert", () => {
    expect(watchdogHealth(null, now).health).toBe("inconnu");
    expect(watchdogHealth(row({ ran_at: "pas une date" }), now).health).toBe("inconnu");
  });
});
