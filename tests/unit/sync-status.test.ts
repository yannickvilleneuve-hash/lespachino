import { describe, it, expect } from "vitest";
import { reconcileStatuses, soldDaysAgo } from "@/lib/listings/sync-status";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

function makeSupabase(existing: Record<string, { serti_status: string; sold_at: string | null; quoted_at: string | null }>) {
  const upserts: unknown[] = [];
  const sb = {
    from(_table: string) {
      void _table;
      return {
        select() {
          return {
            in() {
              return Promise.resolve({
                data: Object.entries(existing).map(([unit, v]) => ({
                  unit,
                  serti_status: v.serti_status,
                  sold_at: v.sold_at,
                  quoted_at: v.quoted_at,
                })),
                error: null,
              });
            },
          };
        },
        upsert(rows: unknown[]) {
          upserts.push(...rows);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { sb, upserts };
}

describe("soldDaysAgo", () => {
  it("compte les jours depuis la vente", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    expect(soldDaysAgo(null, now)).toBeNull();
    expect(soldDaysAgo("2026-04-29T12:00:00Z", now)).toBe(0);
    expect(soldDaysAgo("2026-04-19T12:00:00Z", now)).toBe(10);
  });
});

describe("reconcileStatuses", () => {
  it("crée une nouvelle ligne avec sold_at stamp si véhicule absent et sold", async () => {
    const { sb, upserts } = makeSupabase({});
    const now = new Date("2026-04-29T00:00:00Z");
    const out = await reconcileStatuses(
      [{ unit: "U1", status: "sold" }],
      sb,
      now,
    );
    expect(upserts).toHaveLength(1);
    expect(out.get("U1")?.sold_at).toBe(now.toISOString());
    expect(out.get("U1")?.serti_status).toBe("sold");
  });

  it("ne re-stamp pas sold_at si déjà set", async () => {
    const { sb, upserts } = makeSupabase({
      U1: { serti_status: "sold", sold_at: "2026-04-20T00:00:00Z", quoted_at: null },
    });
    const out = await reconcileStatuses(
      [{ unit: "U1", status: "sold" }],
      sb,
      new Date("2026-04-29T00:00:00Z"),
    );
    expect(upserts).toHaveLength(0); // pas de transition
    expect(out.get("U1")?.sold_at).toBe("2026-04-20T00:00:00Z");
  });

  it("stamp sold_at sur transition available→sold", async () => {
    const { sb, upserts } = makeSupabase({
      U1: { serti_status: "available", sold_at: null, quoted_at: null },
    });
    const now = new Date("2026-04-29T00:00:00Z");
    const out = await reconcileStatuses([{ unit: "U1", status: "sold" }], sb, now);
    expect(upserts).toHaveLength(1);
    expect(out.get("U1")?.sold_at).toBe(now.toISOString());
  });

  it("stamp quoted_at sur transition vers quoted", async () => {
    const { sb, upserts } = makeSupabase({
      U1: { serti_status: "available", sold_at: null, quoted_at: null },
    });
    const now = new Date("2026-04-29T00:00:00Z");
    const out = await reconcileStatuses([{ unit: "U1", status: "quoted" }], sb, now);
    expect(upserts).toHaveLength(1);
    expect(out.get("U1")?.quoted_at).toBe(now.toISOString());
  });

  it("idempotent sur statut inchangé", async () => {
    const { sb, upserts } = makeSupabase({
      U1: { serti_status: "available", sold_at: null, quoted_at: null },
    });
    await reconcileStatuses(
      [{ unit: "U1", status: "available" }],
      sb,
      new Date(),
    );
    expect(upserts).toHaveLength(0);
  });
});
