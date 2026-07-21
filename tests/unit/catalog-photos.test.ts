process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mirrorPhoto, publicPhotoUrl } from "@/lib/catalog/photos";

interface Capture {
  uploads: Array<{ path: string; contentType: string | undefined }>;
}

function makeSupabase(c: Capture) {
  return {
    storage: {
      from(_bucket: string) {
        return {
          upload(path: string, _body: ArrayBuffer, opts?: { contentType?: string }) {
            c.uploads.push({ path, contentType: opts?.contentType });
            return Promise.resolve({ data: { path }, error: null });
          },
        };
      },
    },
  } as unknown as Parameters<typeof mirrorPhoto>[0];
}

describe("publicPhotoUrl", () => {
  it("builds the public storage URL from the bucket path", () => {
    expect(publicPhotoUrl("catalog/1/0.jpg")).toBe(
      "https://proj.supabase.co/storage/v1/object/public/vehicle-photos/catalog/1/0.jpg",
    );
  });
});

describe("mirrorPhoto", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads under catalog/<id>/<position>.<ext> and returns the path", async () => {
    const c: Capture = { uploads: [] };
    const path = await mirrorPhoto(makeSupabase(c), "223612404", 0, "https://cdn.lespac.com/a.jpg");

    expect(path).toBe("catalog/223612404/0.jpg");
    expect(c.uploads[0]).toMatchObject({
      path: "catalog/223612404/0.jpg",
      contentType: "image/jpeg",
    });
  });

  it("returns null when the source photo cannot be downloaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const c: Capture = { uploads: [] };
    const path = await mirrorPhoto(makeSupabase(c), "1", 0, "https://cdn.lespac.com/gone.jpg");

    expect(path).toBeNull();
    expect(c.uploads).toHaveLength(0);
  });
});
