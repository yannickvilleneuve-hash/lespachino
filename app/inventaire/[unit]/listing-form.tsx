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

const PRICE_MARKUP = 1.25;

export interface VehicleContext {
  year: number;
  make: string;
  model: string;
  km: number;
  color: string;
  category: string;
  cost: number;
}

function suggestDescription(v: VehicleContext): string {
  const title = `${v.year || ""} ${v.make} ${v.model}`.trim();
  const km = v.km > 0 ? ` — ${v.km.toLocaleString("fr-CA")} km` : "";
  const color = v.color ? `, couleur ${v.color.toLowerCase()}` : "";
  const cat = v.category ? `${v.category.toLowerCase()}` : "véhicule";
  return `${title}${km}${color}. ${
    cat.charAt(0).toUpperCase() + cat.slice(1)
  } inspecté, prêt à servir. Contactez-nous pour plus de détails ou pour planifier un essai.`;
}

function suggestPrice(cost: number): number {
  if (!cost || cost <= 0) return 0;
  return Math.round((cost * PRICE_MARKUP) / 100) * 100;
}

export default function ListingForm({
  unit,
  defaults,
  isPublished,
  vehicle,
}: {
  unit: string;
  defaults: ListingFormInput;
  isPublished: boolean;
  vehicle: VehicleContext;
}) {
  const [isPending, startTransition] = useTransition();
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
    reset,
  } = useForm<ListingFormInput>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: ListingFormInput) {
    await upsertListing(unit, values);
    reset(values); // marque clean
  }

  function onTogglePublishClick() {
    setPublishMsg(null);
    setShowConfirm(true);
  }

  function confirmTogglePublish() {
    setShowConfirm(false);
    startTransition(async () => {
      const result = await togglePublished(unit, !isPublished);
      if (!result.ok) setPublishMsg(PUBLICATION_ERROR_MSG[result.error]);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">Prix CAD</label>
          {vehicle.cost > 0 && (
            <button
              type="button"
              onClick={() =>
                setValue("price_cad", suggestPrice(vehicle.cost), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              className="text-xs text-blue-700 hover:underline"
              title={`Coûtant × ${PRICE_MARKUP} arrondi à $100`}
            >
              💡 Suggérer prix
            </button>
          )}
        </div>
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
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">Description (FR)</label>
          <button
            type="button"
            onClick={() =>
              setValue("description_fr", suggestDescription(vehicle), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            className="text-xs text-blue-700 hover:underline"
          >
            💡 Suggérer description
          </button>
        </div>
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
          onClick={onTogglePublishClick}
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
      {showConfirm && (
        <ConfirmPublishModal
          isPublished={isPublished}
          unit={unit}
          onCancel={() => setShowConfirm(false)}
          onConfirm={confirmTogglePublish}
        />
      )}
    </form>
  );
}

function ConfirmPublishModal({
  isPublished,
  unit,
  onCancel,
  onConfirm,
}: {
  isPublished: boolean;
  unit: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const action = isPublished ? "dépublier" : "publier";
  const verb = isPublished ? "Dépublier" : "Publier";
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-2">
          {verb} véhicule {unit}?
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          {isPublished
            ? "Le véhicule sera retiré de tous les canaux ci-dessous."
            : "Le véhicule sera publié sur tous les canaux ci-dessous."}
        </p>
        <ul className="text-sm space-y-1.5 mb-5">
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span>Catalogue interne</span>
            <span className="text-xs text-gray-500 ml-auto">instant</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Wix collection</span>
            <span className="text-xs text-gray-500 ml-auto">instant</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>Meta Marketplace</span>
            <span className="text-xs text-gray-500 ml-auto">{isPublished ? "≤ 1 h" : "≤ 1 h"}</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>Google Vehicle Ads</span>
            <span className="text-xs text-gray-500 ml-auto">≤ 24 h</span>
          </li>
        </ul>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              "px-4 py-2 text-sm rounded text-white " +
              (isPublished ? "bg-gray-700 hover:bg-gray-800" : "bg-green-700 hover:bg-green-800")
            }
          >
            {`Oui, ${action}`}
          </button>
        </div>
      </div>
    </div>
  );
}
