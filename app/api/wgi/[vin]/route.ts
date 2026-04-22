import { getVehicleByVin } from "@/lib/serti/wgi";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin } = await params;
  try {
    const vehicle = await getVehicleByVin(vin);
    if (!vehicle) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(vehicle);
  } catch (err) {
    const message = err instanceof Error ? err.message : "serti_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
