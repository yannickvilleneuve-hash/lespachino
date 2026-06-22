/**
 * Unit tests for the Facebook Marketplace driver pure helpers.
 * Live clicks / Playwright DOM interactions are NOT tested here — those are
 * verified manually after operator fills in the SELECTORS.
 */
import { describe, it, expect } from "vitest";
import {
  mapListingToFields,
  classifyError,
} from "@/lib/bot/drivers/facebook";
import {
  SessionExpiredError,
  TransientError,
  FatalError,
} from "@/lib/bot/types";
import { errors as playwrightErrors } from "playwright";

const { TimeoutError } = playwrightErrors;
import type { MirrorListing } from "@/lib/bot/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeListing(overrides: Partial<MirrorListing> = {}): MirrorListing {
  return {
    lespacId: "lp-123",
    title: "2020 Hino 195 Cab & Chassis",
    priceCad: 49500,
    description: "Good condition, low mileage.",
    photoUrls: ["https://example.com/photo1.jpg"],
    contentHash: "abc123",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mapListingToFields
// ---------------------------------------------------------------------------

describe("mapListingToFields", () => {
  it("parses year, make, model from a standard title", () => {
    const fields = mapListingToFields(makeListing());
    expect(fields.year).toBe("2020");
    expect(fields.make).toBe("Hino");
    expect(fields.model).toBe("195 Cab & Chassis");
  });

  it("sets vehicleType to Truck", () => {
    const fields = mapListingToFields(makeListing());
    expect(fields.vehicleType).toBe("Truck");
  });

  it("converts priceCad number to string", () => {
    const fields = mapListingToFields(makeListing({ priceCad: 49500 }));
    expect(fields.price).toBe("49500");
  });

  it("converts null priceCad to empty string", () => {
    const fields = mapListingToFields(makeListing({ priceCad: null }));
    expect(fields.price).toBe("");
  });

  it("rounds fractional priceCad", () => {
    const fields = mapListingToFields(makeListing({ priceCad: 49500.75 }));
    expect(fields.price).toBe("49501");
  });

  it("passes description through verbatim", () => {
    const fields = mapListingToFields(
      makeListing({ description: "Runs great! Call 514-555-1234." }),
    );
    expect(fields.description).toBe("Runs great! Call 514-555-1234.");
  });

  it("handles title with no leading year — never throws", () => {
    const fields = mapListingToFields(
      makeListing({ title: "Hino 195 Cab & Chassis" }),
    );
    expect(fields.year).toBe("");
    expect(fields.make).toBe("Hino");
    expect(fields.model).toBe("195 Cab & Chassis");
  });

  it("handles a title that is only a year", () => {
    const fields = mapListingToFields(makeListing({ title: "2022" }));
    expect(fields.year).toBe("2022");
    expect(fields.make).toBe("");
    expect(fields.model).toBe("");
  });

  it("handles empty title without throwing", () => {
    const fields = mapListingToFields(makeListing({ title: "" }));
    expect(fields.year).toBe("");
    expect(fields.make).toBe("");
    expect(fields.model).toBe("");
  });

  it("handles title where first token looks like a year but is out of range", () => {
    // "1800" doesn't match (19|20)\d{2}, so no year extracted
    const fields = mapListingToFields(
      makeListing({ title: "1800 Antique Truck" }),
    );
    expect(fields.year).toBe("");
    expect(fields.make).toBe("1800");
  });

  it("parses a different make/model correctly", () => {
    const fields = mapListingToFields(
      makeListing({ title: "2019 Kenworth T680" }),
    );
    expect(fields.year).toBe("2019");
    expect(fields.make).toBe("Kenworth");
    expect(fields.model).toBe("T680");
  });
});

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

describe("classifyError", () => {
  it("maps a Playwright TimeoutError to TransientError", () => {
    const err = new TimeoutError("Timeout 30000ms exceeded");
    const result = classifyError(err);
    expect(result).toBeInstanceOf(TransientError);
    expect(result.message).toContain("Timeout");
  });

  it("maps an Error with net:: in message to TransientError", () => {
    const err = new Error("net::ERR_CONNECTION_RESET");
    const result = classifyError(err);
    expect(result).toBeInstanceOf(TransientError);
  });

  it("maps an Error with ECONN in message to TransientError", () => {
    const err = new Error("connect ECONNREFUSED 127.0.0.1:3000");
    const result = classifyError(err);
    expect(result).toBeInstanceOf(TransientError);
  });

  it("maps an Error with ENOTFOUND to TransientError", () => {
    const err = new Error("getaddrinfo ENOTFOUND www.facebook.com");
    const result = classifyError(err);
    expect(result).toBeInstanceOf(TransientError);
  });

  it("maps an Error with ETIMEDOUT to TransientError", () => {
    const err = new Error("connect ETIMEDOUT 157.240.8.35:443");
    const result = classifyError(err);
    expect(result).toBeInstanceOf(TransientError);
  });

  it("maps any other Error to FatalError", () => {
    const err = new Error("Unknown element: #missing-button");
    const result = classifyError(err);
    expect(result).toBeInstanceOf(FatalError);
    expect(result.message).toBe("Unknown element: #missing-button");
  });

  it("maps a non-Error thrown value to FatalError with string coercion", () => {
    const result = classifyError("something went wrong");
    expect(result).toBeInstanceOf(FatalError);
    expect(result.message).toBe("something went wrong");
  });

  it("passes through an already-typed SessionExpiredError unchanged (idempotent)", () => {
    const err = new SessionExpiredError("already typed");
    const result = classifyError(err);
    expect(result).toBe(err);
    expect(result).toBeInstanceOf(SessionExpiredError);
  });

  it("passes through an already-typed TransientError unchanged (idempotent)", () => {
    const err = new TransientError("already typed");
    const result = classifyError(err);
    expect(result).toBe(err);
    expect(result).toBeInstanceOf(TransientError);
  });

  it("passes through an already-typed FatalError unchanged (idempotent)", () => {
    const err = new FatalError("already typed");
    const result = classifyError(err);
    expect(result).toBe(err);
    expect(result).toBeInstanceOf(FatalError);
  });

  it("maps a page with login URL to SessionExpiredError when err is generic", () => {
    // Simulate a page whose URL has drifted to a login page
    const fakePage = { url: () => "https://www.facebook.com/login/?next=%2Fmarketplace" } as never;
    const err = new Error("element not found");
    const result = classifyError(err, fakePage);
    expect(result).toBeInstanceOf(SessionExpiredError);
    expect(result.message).toMatch(/redirected to login/);
  });

  it("maps a page with checkpoint URL to SessionExpiredError", () => {
    const fakePage = { url: () => "https://www.facebook.com/checkpoint/?next=..." } as never;
    const err = new Error("element not found");
    const result = classifyError(err, fakePage);
    expect(result).toBeInstanceOf(SessionExpiredError);
  });

  it("maps a page with two_step_verification URL to SessionExpiredError", () => {
    const fakePage = { url: () => "https://www.facebook.com/two_step_verification/authentication/" } as never;
    const err = new Error("element not found");
    const result = classifyError(err, fakePage);
    expect(result).toBeInstanceOf(SessionExpiredError);
  });
});
