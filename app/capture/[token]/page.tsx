import Link from "next/link";
import { validatePhotoSession } from "@/lib/photo-sessions/actions";
import { getVehicleByUnit } from "@/lib/serti/wgi";
import CaptureClient from "./capture-client";

export const dynamic = "force-dynamic";

export default async function CapturePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validatePhotoSession(token);

  if (!session.ok) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white border rounded shadow-md p-6 max-w-sm text-center">
          <h1 className="text-lg font-semibold mb-2">Session invalide</h1>
          <p className="text-sm text-gray-600 mb-4">
            {session.reason === "expired"
              ? "Le lien a expiré (max 30 min)."
              : session.reason === "exhausted"
                ? "La limite de photos pour cette session est atteinte."
                : "Lien introuvable. Demande un nouveau code QR à l'admin."}
          </p>
          <Link href="/" className="text-xs text-blue-700 hover:underline">
            Retour
          </Link>
        </div>
      </main>
    );
  }

  const vehicle = await getVehicleByUnit(session.unit!);

  return (
    <CaptureClient
      token={token}
      unit={session.unit!}
      vehicleLabel={
        vehicle
          ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
          : session.unit!
      }
      expiresAt={session.expires_at!}
      remainingUploads={session.remaining_uploads ?? 0}
    />
  );
}
