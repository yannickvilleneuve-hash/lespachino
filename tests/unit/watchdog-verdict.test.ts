import { describe, it, expect } from "vitest";
import {
  judge, decideAlert, describe as explain, SYNC_STALE_SEC, REMINDER_SEC,
  type AlertState,
} from "@/supabase/functions/pipeline-watchdog/verdict";

const sain = { status: 200, included: 19, source: "live" };
const syncSain = { ageSec: 300, ok: true };

describe("judge", () => {
  it("dit OK quand le feed sert du live et que le worker suit", () => {
    expect(judge(sain, syncSain)).toBe("OK");
  });

  it("traite une requête sans réponse comme un feed mort", () => {
    expect(judge({ status: null, included: null, source: null }, syncSain)).toBe("FEED_DOWN");
  });

  it("voit un feed vide même si le serveur répond 200", () => {
    expect(judge({ ...sain, included: 0 }, syncSain)).toBe("FEED_THIN");
  });

  it("signale le mode dégradé — le blindage tient, mais le snapshot vieillit", () => {
    expect(judge({ ...sain, source: "snapshot" }, syncSain)).toBe("FEED_DEGRADED");
  });

  it("fait passer la panne publique avant la panne interne", () => {
    // Feed mort ET worker en échec: c'est le feed qu'on nomme, il coûte des pubs.
    expect(judge({ status: 503, included: null, source: null }, { ageSec: 99999, ok: false }))
      .toBe("FEED_DOWN");
  });

  it("attrape un worker en échec et un worker en retard", () => {
    expect(judge(sain, { ageSec: 300, ok: false })).toBe("SYNC_FAILING");
    expect(judge(sain, { ageSec: SYNC_STALE_SEC + 1, ok: true })).toBe("SYNC_STALE");
  });

  it("ne peint jamais en vert un état inconnu", () => {
    expect(judge(sain, { ageSec: null, ok: null })).toBe("UNKNOWN");
  });
});

const état = (o: Partial<AlertState> = {}): AlertState =>
  ({ consecutiveRed: 1, sinceLastAlertSec: null, previousWasRed: false, ...o });

describe("decideAlert", () => {
  it("se tait au premier verdict rouge — un incident isolé n'est pas une panne", () => {
    expect(decideAlert("FEED_DOWN", état({ consecutiveRed: 1 }))).toBe("silence");
  });

  it("alerte au deuxième rouge consécutif", () => {
    expect(decideAlert("FEED_DOWN", état({ consecutiveRed: 2 }))).toBe("alert");
  });

  it("ne répète qu'une fois par 24 h — une alerte aux 15 min cesse d'être lue", () => {
    const s = { consecutiveRed: 9, previousWasRed: true };
    expect(decideAlert("FEED_DOWN", état({ ...s, sinceLastAlertSec: 3600 }))).toBe("silence");
    expect(decideAlert("FEED_DOWN", état({ ...s, sinceLastAlertSec: REMINDER_SEC }))).toBe("reminder");
  });

  it("annonce le rétablissement, et une seule fois", () => {
    expect(decideAlert("OK", état({ consecutiveRed: 0, previousWasRed: true }))).toBe("recovery");
    expect(decideAlert("OK", état({ consecutiveRed: 0, previousWasRed: false }))).toBe("silence");
  });
});

describe("describe", () => {
  it("explique la conséquence, pas seulement le symptôme", () => {
    expect(explain("FEED_THIN", { ...sain, included: 0 }, syncSain)).toMatch(/viderait le catalogue/i);
    expect(explain("SYNC_STALE", sain, { ageSec: 3600, ok: true })).toMatch(/60 minutes/);
  });
});
