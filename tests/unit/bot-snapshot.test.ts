import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { NormalizedListing } from "@/lib/bot/types";
import { refreshSnapshot } from "@/lib/bot/snapshot";

const upsert = vi.fn();
const goneUpdate = vi.fn();
const selectRows = vi.fn();

// A chainable builder: from('lespac_listing') returns an object whose methods
// record calls and resolve to { data, error }.
function makeClient(): SupabaseClient<Database> {
  const updateChain = {
    update: (patch: unknown) => {
      goneUpdate(patch);
      return updateChain;
    },
    eq: () => updateChain,
    not: (col: string, op: string, val: unknown) => {
      goneUpdate.mock.results; // touch
      goneUpdate(`not:${col}:${op}`, val);
      return Promise.resolve({ data: null, error: null });
    },
  };
  const builder = {
    upsert: (rows: unknown, opts: unknown) => {
      upsert(rows, opts);
      return Promise.resolve({ data: null, error: null });
    },
    update: updateChain.update,
    eq: updateChain.eq,
    not: updateChain.not,
    select: () => Promise.resolve(selectRows()),
  };
  return { from: () => builder } as unknown as SupabaseClient<Database>;
}

const listing = (o: Partial<NormalizedListing>): NormalizedListing => ({
  lespacId: "1",
  title: "T",
  priceCad: 100,
  description: "D",
  photoUrls: ["a", "b"],
  ...o,
});

beforeEach(() => {
  upsert.mockReset();
  goneUpdate.mockReset();
  selectRows.mockReset();
  selectRows.mockReturnValue({
    data: [{ lespac_id: "1", content_hash: "h1", status: "active" }],
    error: null,
  });
});

describe("refreshSnapshot", () => {
  it("upserts each listing with a content_hash and active status", async () => {
    const client = makeClient();
    await refreshSnapshot(client, [listing({ lespacId: "1" })]);

    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, opts] = upsert.mock.calls[0];
    expect((opts as { onConflict: string }).onConflict).toBe("lespac_id");
    const row = (rows as Record<string, unknown>[])[0];
    expect(row.lespac_id).toBe("1");
    expect(row.status).toBe("active");
    expect(typeof row.content_hash).toBe("string");
    expect((row.content_hash as string).length).toBe(64);
    expect(row).toHaveProperty("last_seen");
  });

  it("flips previously-active rows absent from the pull to gone", async () => {
    const client = makeClient();
    await refreshSnapshot(client, [listing({ lespacId: "1" })]);

    // gone-update was issued with status:'gone' and an exclusion of the
    // present ids.
    const patches = goneUpdate.mock.calls.map((c) => c[0]);
    expect(patches).toContainEqual({ status: "gone" });
    expect(
      goneUpdate.mock.calls.some(
        (c) => typeof c[0] === "string" && c[0].startsWith("not:lespac_id"),
      ),
    ).toBe(true);
  });

  it("returns current rows as SnapshotRow[]", async () => {
    const client = makeClient();
    const out = await refreshSnapshot(client, [listing({ lespacId: "1" })]);
    expect(out).toEqual([
      { lespacId: "1", contentHash: "h1", status: "active" },
    ]);
  });

  it("flips ALL active rows gone when the pull is empty", async () => {
    const client = makeClient();
    await refreshSnapshot(client, []);
    expect(upsert).not.toHaveBeenCalled();
    expect(goneUpdate.mock.calls.map((c) => c[0])).toContainEqual({
      status: "gone",
    });
  });
});
