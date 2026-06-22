import type { Platform } from "@/lib/bot/types";

export interface PublicationRow {
  lespacId: string;
  platform: Platform;
  status: "pending" | "live" | "failed" | "removed";
  externalUrl: string | null;
  externalId: string | null;
  publishedHash: string | null;
  attemptCount: number;
}
