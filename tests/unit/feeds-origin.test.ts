import { describe, it, expect } from "vitest";
import { resolveFeedOrigin, trimTrailingSlash } from "@/lib/feeds/origin";

const noHeaders = { forwardedHost: null, forwardedProto: null, host: null };

describe("trimTrailingSlash", () => {
  it("removes one or many trailing slashes", () => {
    expect(trimTrailingSlash("https://a.com/")).toBe("https://a.com");
    expect(trimTrailingSlash("https://a.com///")).toBe("https://a.com");
    expect(trimTrailingSlash("https://a.com")).toBe("https://a.com");
  });
});

describe("resolveFeedOrigin", () => {
  it("prefers the configured origin over request headers", () => {
    expect(
      resolveFeedOrigin("https://feeds.hinochicoutimi.com", {
        ...noHeaders,
        forwardedHost: "evil.example",
      }),
    ).toBe("https://feeds.hinochicoutimi.com");
  });

  it("trims a trailing slash on the configured origin", () => {
    expect(resolveFeedOrigin("https://a.com/", noHeaders)).toBe("https://a.com");
  });

  it("ignores a blank configured origin", () => {
    expect(
      resolveFeedOrigin("   ", { ...noHeaders, forwardedHost: "a.com" }),
    ).toBe("https://a.com");
  });

  it("prefers x-forwarded-host over host (Cloudflare in front)", () => {
    expect(
      resolveFeedOrigin(undefined, {
        forwardedHost: "feeds.hinochicoutimi.com",
        forwardedProto: "https",
        host: "localhost:3000",
      }),
    ).toBe("https://feeds.hinochicoutimi.com");
  });

  it("falls back to host when there is no forwarded host", () => {
    expect(
      resolveFeedOrigin(undefined, {
        ...noHeaders,
        host: "localhost:3000",
        forwardedProto: "http",
      }),
    ).toBe("http://localhost:3000");
  });

  it("defaults the protocol to https", () => {
    expect(
      resolveFeedOrigin(undefined, { ...noHeaders, host: "a.com" }),
    ).toBe("https://a.com");
  });

  it("throws when no origin can be determined", () => {
    expect(() => resolveFeedOrigin(undefined, noHeaders)).toThrow(
      /cannot resolve feed origin/,
    );
  });
});
