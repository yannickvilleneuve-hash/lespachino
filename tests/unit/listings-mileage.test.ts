import { describe, expect, it } from "vitest";
import { publicMileageKm } from "@/lib/listings/mileage";

const today = new Date("2026-05-05T12:00:00-04:00");

describe("publicMileageKm", () => {
  it("hides SERTI 10 km placeholders for older non-new vehicles", () => {
    expect(
      publicMileageKm(
        { km: 10, year: 2019, category: "CAMION USAGE" },
        today,
      ),
    ).toBe(0);
  });

  it("keeps 10 km on new vehicles", () => {
    expect(
      publicMileageKm(
        { km: 10, year: 2025, category: "CAMION NEUF" },
        today,
      ),
    ).toBe(10);
  });

  it("keeps real mileage values", () => {
    expect(
      publicMileageKm(
        { km: 48060, year: 2024, category: "CAMION USAGE" },
        today,
      ),
    ).toBe(48060);
  });
});
