import type { InventoryRow } from "@/lib/listings/queries";

const STATUS_RANK: Record<InventoryRow["status"], number> = {
  available: 0,
  quoted: 1,
  sold: 2,
};

export function statusRank(r: InventoryRow): number {
  return STATUS_RANK[r.status];
}

export function StatusBadge({ row, dense = false }: { row: InventoryRow; dense?: boolean }) {
  const sz = dense ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  if (row.status === "sold") {
    return (
      <span className={sz + " inline-block rounded font-medium bg-gray-200 text-gray-800"}>
        Vendu
      </span>
    );
  }
  if (row.status === "quoted") {
    return (
      <span className={sz + " inline-block rounded font-medium bg-amber-100 text-amber-800"}>
        En soumission
      </span>
    );
  }
  return (
    <span className={sz + " inline-block rounded font-medium bg-emerald-100 text-emerald-800"}>
      Disponible
    </span>
  );
}
