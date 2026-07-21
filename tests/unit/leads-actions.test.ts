import { describe, it, expect, vi, beforeEach } from "vitest";

/** Mocks: isolate submitLead from headers/Supabase/Graph mail. */
let currentIp = "1.2.3.4";
const insert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null as null | { message: string } }));
const sendMail = vi.fn(async (_arg: unknown) => {});
const listUsers = vi.fn(async () => ({
  data: { users: [{ email: "alan@camion-hino.ca" }, { email: "yannick@camion-hino.ca" }] },
  error: null as null | { message: string },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", currentIp], ["user-agent", "vitest"]]),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ insert }),
    auth: { admin: { listUsers } },
  }),
}));
vi.mock("@/lib/graph/mail", () => ({ sendGraphEmail: (a: unknown) => sendMail(a) }));

import { submitLead, type LeadState } from "@/lib/leads/actions";

const S0: LeadState = { ok: false, message: "" };
function fd(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}

describe("submitLead", () => {
  beforeEach(() => {
    insert.mockClear();
    sendMail.mockClear();
    listUsers.mockClear();
    insert.mockResolvedValue({ error: null });
  });

  it("rejects a missing name without inserting", async () => {
    currentIp = "10.0.0.1";
    const r = await submitLead(S0, fd({ unit: "217913639", message: "hi" }));
    expect(r.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("saves the lead and emails the dealer on a valid submission", async () => {
    currentIp = "10.0.0.2";
    const r = await submitLead(S0, fd({ unit: "217913639", name: "Jean", email: "j@ex.com", message: "Dispo?" }));
    expect(r.ok).toBe(true);
    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0][0]).toMatchObject({ unit: "217913639", name: "Jean" });
    expect(sendMail).toHaveBeenCalledOnce();
    // IP is stored hashed, never in clear.
    expect(insert.mock.calls[0][0].ip_hash).not.toContain("10.0.0.2");
  });

  it("CCs every dealer user so a lead isn't hidden by an unmonitored inbox", async () => {
    currentIp = "10.0.0.9";
    await submitLead(S0, fd({ unit: "1", name: "Jean", message: "Dispo?" }));
    expect(sendMail).toHaveBeenCalledOnce();
    const arg = sendMail.mock.calls[0][0] as { cc: string[] };
    expect(arg.cc).toEqual(["alan@camion-hino.ca", "yannick@camion-hino.ca"]);
  });

  it("rate-limits after 5 submissions from the same IP", async () => {
    currentIp = "10.0.0.3";
    for (let i = 0; i < 5; i++) {
      const r = await submitLead(S0, fd({ unit: "1", name: "A", message: "m" }));
      expect(r.ok).toBe(true);
    }
    const sixth = await submitLead(S0, fd({ unit: "1", name: "A", message: "m" }));
    expect(sixth.ok).toBe(false);
    expect(sixth.message).toMatch(/trop de demandes/i);
  });
});
