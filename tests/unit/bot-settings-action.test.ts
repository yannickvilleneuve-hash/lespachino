import { describe, it, expect, vi, beforeEach } from "vitest";

const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ update }) }),
}));
vi.mock("@/lib/auth/current-editor", () => ({ currentEditor: () => Promise.resolve("tester") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({
  requireAllowedUser: vi.fn(() => Promise.resolve("tester@example.com")),
}));

import { saveBotSettings } from "@/app/dashboard/bot/settings/actions";
import { requireAllowedUser } from "@/lib/auth/require-user";

beforeEach(() => {
  update.mockClear();
  vi.mocked(requireAllowedUser).mockReset();
  vi.mocked(requireAllowedUser).mockResolvedValue("tester@example.com");
});

const valid = {
  enabledPlatforms: ["facebook"],
  syncIntervalSec: 3600,
  operatorEmail: "ops@example.com",
  maxJobsPerCycle: 8,
  paceMinMs: 4000,
  paceMaxMs: 12000,
};

describe("saveBotSettings", () => {
  it("writes valid settings via the admin client", async () => {
    const res = await saveBotSettings(valid);
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = update.mock.calls as any[];
    const payload = calls[0][0] as Record<string, unknown>;
    expect(payload.sync_interval_sec).toBe(3600);
    expect(payload.updated_by).toBe("tester");
  });

  it("rejects invalid input without writing", async () => {
    const res = await saveBotSettings({ ...valid, operatorEmail: "nope" });
    expect(res.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns {ok:false} and does not write when unauthenticated", async () => {
    vi.mocked(requireAllowedUser).mockRejectedValue(new Error("Non authentifié"));
    const res = await saveBotSettings(valid);
    expect(res.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
