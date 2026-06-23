import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/graph/mail", () => ({ sendGraphEmail: vi.fn() }));
vi.mock("@/lib/bot/config", () => ({
  getBotConfig: vi.fn().mockResolvedValue({ operatorEmail: "ops@x.ca" }),
}));

import { alertOperator } from "@/lib/bot/alerter";
import { sendGraphEmail } from "@/lib/graph/mail";

type Row = { created_at: string; detail: { dedupKey: string } };

// Minimal Supabase query-builder mock: select().eq().eq().gte().order().limit().maybeSingle()
function makeSupabase(existing: Row | null) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "limit"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
  const from = vi.fn((table: string) => (table === "bot_event" ? { ...builder, insert } : { insert }));
  return { supabase: { from } as never, from, insert, builder };
}

beforeEach(() => vi.clearAllMocks());

describe("alertOperator", () => {
  it("sends email and logs bot_event on first occurrence", async () => {
    const { supabase, insert } = makeSupabase(null);
    await alertOperator(supabase, "fb-session-dead", "Subject", "Body text");

    expect(sendGraphEmail).toHaveBeenCalledTimes(1);
    expect(sendGraphEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ops@x.ca", subject: "Subject" }),
    );
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "alert",
        detail: expect.objectContaining({ dedupKey: "fb-session-dead" }),
      }),
    );
  });

  it("suppresses a repeat within the dedup window", async () => {
    const recent: Row = {
      created_at: new Date().toISOString(),
      detail: { dedupKey: "fb-session-dead" },
    };
    const { supabase, insert } = makeSupabase(recent);
    await alertOperator(supabase, "fb-session-dead", "Subject", "Body");

    expect(sendGraphEmail).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("throws when no operator email is configured", async () => {
    vi.resetModules();
    vi.doMock("@/lib/bot/config", () => ({
      getBotConfig: vi.fn().mockResolvedValue({ operatorEmail: "" }),
    }));
    const { alertOperator: alert } = await import("@/lib/bot/alerter");
    const { supabase } = makeSupabase(null);
    await expect(alert(supabase, "k", "s", "b")).rejects.toThrow();
  });
});
