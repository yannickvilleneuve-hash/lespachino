interface MileageInput {
  km: number;
  year: number;
  category: string;
}

function isNewCategory(category: string): boolean {
  const c = category.toUpperCase();
  return c.includes("NEUF") || c.includes("NEUV") || c.includes("NEW");
}

export function publicMileageKm(vehicle: MileageInput, today = new Date()): number {
  const km = Math.max(0, Math.round(vehicle.km));
  const currentYear = today.getFullYear();
  if (km === 10 && !isNewCategory(vehicle.category) && vehicle.year < currentYear) {
    return 0;
  }
  return km;
}
