import Link from "next/link";
import AppHeader from "@/app/app-header";
import ScanVinClient from "./scan-vin-client";

export const dynamic = "force-dynamic";

export default function ScanVinPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Scanner VIN"
        right={
          <Link href="/inventaire" className="text-xs text-white/70 hover:text-white">
            ← Inventaire
          </Link>
        }
      />
      <ScanVinClient />
    </main>
  );
}
