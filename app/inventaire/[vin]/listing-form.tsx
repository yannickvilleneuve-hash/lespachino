"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CHANNELS,
  listingFormSchema,
  type Channel,
  type ListingFormInput,
} from "@/lib/listings/schema";
import { upsertListing, togglePublished } from "@/lib/listings/actions";
import type { PublicationError } from "@/lib/listings/publication";

const PUBLICATION_ERROR_MSG: Record<PublicationError, string> = {
  price_missing: "Il faut un prix > 0 avant de publier.",
  description_missing: "Il faut une description avant de publier.",
  no_photos: "Il faut au moins une photo avant de publier.",
  no_hero: "Il faut désigner une photo principale (hero).",
};

const CHANNEL_LABELS: Record<Channel, string> = {
  native: "Site natif",
  fb: "Facebook Marketplace",
  lespac: "Lespac",
  kijiji: "Kijiji",
};

export default function ListingForm({
  vin,
  defaults,
  isPublished,
}: {
  vin: string;
  defaults: ListingFormInput;
  isPublished: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
    reset,
  } = useForm<ListingFormInput>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: ListingFormInput) {
    await upsertListing(vin, values);
    reset(values); // marque clean
  }

  function onTogglePublish() {
    setPublishMsg(null);
    startTransition(async () => {
      const result = await togglePublished(vin, !isPublished);
      if (!result.ok) setPublishMsg(PUBLICATION_ERROR_MSG[result.error]);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1">Prix CAD</label>
        <input
          type="number"
          step="0.01"
          {...register("price_cad", { valueAsNumber: true })}
          className="w-full border rounded px-3 py-2 font-mono"
        />
        {errors.price_cad && (
          <p className="text-sm text-red-600 mt-1">{errors.price_cad.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description (FR)</label>
        <textarea
          {...register("description_fr")}
          rows={6}
          className="w-full border rounded px-3 py-2"
        />
        {errors.description_fr && (
          <p className="text-sm text-red-600 mt-1">{errors.description_fr.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Canaux de publication</label>
        <div className="grid grid-cols-2 gap-2">
          {CHANNELS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input type="checkbox" value={c} {...register("channels")} />
              {CHANNEL_LABELS[c]}
            </label>
          ))}
        </div>
        {errors.channels && (
          <p className="text-sm text-red-600 mt-1">{errors.channels.message}</p>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="bg-blue-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          {isSubmitting ? "Sauvegarde..." : "Sauvegarder"}
        </button>
        {isSubmitSuccessful && !isDirty && (
          <span className="text-sm text-green-700">Sauvegardé</span>
        )}

        <button
          type="button"
          onClick={onTogglePublish}
          disabled={isPending}
          className={
            "ml-auto px-4 py-2 rounded text-sm disabled:opacity-50 " +
            (isPublished
              ? "bg-gray-200 text-gray-800"
              : "bg-green-700 text-white")
          }
        >
          {isPending
            ? "..."
            : isPublished
              ? "Dépublier"
              : "Publier"}
        </button>
      </div>
      {publishMsg && <p className="text-sm text-red-600">{publishMsg}</p>}
    </form>
  );
}
