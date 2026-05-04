import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { Channel } from "./schema";

export type PublicationJobAction = "publish" | "unpublish" | "refresh" | "post";
export type PublicationJobStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

interface CreatePublicationJobInput {
  unit: string;
  channel: Channel;
  action: PublicationJobAction;
  createdByEmail: string | null;
  payload?: Json;
}

export async function createPublicationJob(
  supabase: SupabaseClient<Database>,
  input: CreatePublicationJobInput,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("publication_job")
    .insert({
      unit: input.unit,
      channel: input.channel,
      action: input.action,
      status: "pending",
      created_by_email: input.createdByEmail,
      payload: input.payload ?? {},
    })
    .select("id")
    .single();
  if (error) {
    console.error(`publication_job create ${input.channel} ${input.unit}:`, error.message);
    return null;
  }
  return data.id;
}

export async function markPublicationJobRunning(
  supabase: SupabaseClient<Database>,
  jobId: string | null,
): Promise<void> {
  if (!jobId) return;
  const { error } = await supabase
    .from("publication_job")
    .update({
      status: "running",
      attempts: 1,
      started_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", jobId);
  if (error) console.error(`publication_job running ${jobId}:`, error.message);
}

export async function finishPublicationJob(
  supabase: SupabaseClient<Database>,
  jobId: string | null,
  status: PublicationJobStatus,
  errorMessage: string | null = null,
): Promise<void> {
  if (!jobId) return;
  const { error } = await supabase
    .from("publication_job")
    .update({
      status,
      last_error: errorMessage,
      completed_at: new Date().toISOString(),
      next_retry_at: status === "failed" ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
    })
    .eq("id", jobId);
  if (error) console.error(`publication_job finish ${jobId}:`, error.message);
}
