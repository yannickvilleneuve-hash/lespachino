import { getVehicleByVin } from "@/lib/serti/wgi";
import { isEmailAllowed } from "@/lib/auth/whitelist";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!user.email || !(await isEmailAllowed(user.email))) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const vehicle = await getVehicleByVin(vin);
    if (!vehicle) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(vehicle);
  } catch (err) {
    const message = err instanceof Error ? err.message : "serti_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
