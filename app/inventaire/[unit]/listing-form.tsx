"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CHANNELS,
  listingFormSchema,
  type Channel,
  type ListingFormInput,
} from "@/lib/listings/schema";
import {
  generateAssistedListingDescription,
  upsertListing,
  togglePublished,
} from "@/lib/listings/actions";
import type { PublicationError } from "@/lib/listings/publication";
import {
  suggestDescription as buildDescription,
  BODY_TYPE_LABELS,
  BODY_TYPES_ORDER,
  type BodyType,
  type SuggestOptions,
} from "@/lib/listings/description-templates";

const PUBLICATION_ERROR_MSG: Record<PublicationError, string> = {
  description_missing: "Il faut une description avant de publier.",
  no_photos: "Il faut au moins une photo avant de publier.",
  no_hero: "Il faut désigner une photo principale.",
  not_available: "SERTI indique que ce véhicule n'est pas disponible à la vente.",
};

const CHANNEL_LABELS: Record<Channel, string> = {
  native: "Site Hino",
  wix: "Wix",
  fb_marketplace: "Facebook Marketplace",
  fb_page: "Page Facebook",
  google_vla: "Google Vehicle Ads",
  lespac: "Lespac",
  kijiji: "Kijiji (à connecter)",
};

const CHANNEL_TIMING: Record<Channel, string> = {
  native: "instant",
  wix: "instant",
  fb_marketplace: "feed",
  fb_page: "post",
  google_vla: "≤ 24 h",
  lespac: "instant",
  kijiji: "non connecté",
};

const PRICE_MARKUP = 1.25;

export type ChannelAvailability = Record<
  Channel,
  {
    ready: boolean;
    reason: string;
  }
>;

export interface VehicleContext {
  year: number;
  make: string;
  model: string;
  km: number;
  color: string;
  category: string;
  cost: number;
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
  channelAvailability,
}: {
  unit: string;
  defaults: ListingFormInput;
  isPublished: boolean;
  vehicle: VehicleContext;
  channelAvailability: ChannelAvailability;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDescPending, startDescTransition] = useTransition();
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [descMsg, setDescMsg] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChannels, setConfirmChannels] = useState<Channel[]>([]);
  const [showOverwrite, setShowOverwrite] = useState(false);
  const [tplBody, setTplBody] = useState<BodyType>("none");
  const [tplLength, setTplLength] = useState<string>("");
  const [tplBrand, setTplBrand] = useState<string>("");
  const [tplReadyToWork, setTplReadyToWork] = useState(false);
  const [tplExcellent, setTplExcellent] = useState(false);
  const [tplAlmostNew, setTplAlmostNew] = useState(false);
  const [tplSaaq, setTplSaaq] = useState<string>("");
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
    reset,
  } = useForm<ListingFormInput>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      ...defaults,
      channels: sanitizeChannels(defaults.channels),
    },
  });

  function sanitizeChannels(channels: readonly Channel[]): Channel[] {
    const enabled = channels.filter((c) => channelAvailability[c]?.ready);
    return enabled.length > 0 ? enabled : ["native"];
  }

  function buildOpts(): SuggestOptions {
    const len = parseInt(tplLength, 10);
    return {
      body_type: tplBody,
      body_length_ft: Number.isFinite(len) && len > 0 ? len : undefined,
      equipment_brand: tplBrand.trim() || undefined,
      ready_to_work: tplReadyToWork,
      excellent_condition: tplExcellent,
      almost_new: tplAlmostNew,
      saaq_inspection: tplSaaq.trim() || undefined,
    };
  }

  function applyLocalSuggestion() {
    return buildDescription(
      { year: vehicle.year, make: vehicle.make, model: vehicle.model, km: vehicle.km },
      buildOpts(),
    );
  }

  function applySuggestion() {
    setDescMsg(null);
    startDescTransition(async () => {
      const result = await generateAssistedListingDescription(unit, buildOpts());
      const text = result.ok ? result.text : applyLocalSuggestion();
      setValue("description_fr", text, { shouldDirty: true, shouldValidate: true });
      if (result.ok) {
        setDescMsg(
          result.source === "openai"
            ? "Description OpenAI prête. Relis rapidement avant de publier."
            : "Description locale générée. OpenAI n'a pas été utilisé.",
        );
      } else {
        setDescMsg("Description locale générée. " + result.error);
      }
    });
  }

  function onSuggestClick() {
    const current = (getValues("description_fr") ?? "").trim();
    if (current.length > 0) {
      setShowOverwrite(true);
      return;
    }
    applySuggestion();
  }

  const needsLength = tplBody !== "none";
  const needsBrand = tplBody === "fourgon_montecharge" || tplBody === "fourgon_frio";

  async function onSubmit(values: ListingFormInput) {
    const clean = { ...values, channels: sanitizeChannels(values.channels) };
    await upsertListing(unit, clean);
    reset(clean); // marque clean
  }

  function onTogglePublishClick() {
    setPublishMsg(null);
    setConfirmChannels(sanitizeChannels(getValues("channels") ?? []));
    setShowConfirm(true);
  }

  function confirmTogglePublish() {
    setShowConfirm(false);
    void handleSubmit(
      (values) => {
        startTransition(async () => {
          try {
            const clean = { ...values, channels: sanitizeChannels(values.channels) };
            await upsertListing(unit, clean);
            reset(clean);
            const result = await togglePublished(unit, !isPublished);
            if (!result.ok) {
              setPublishMsg(PUBLICATION_ERROR_MSG[result.error]);
              return;
            }
            setPublishMsg(
              isPublished
                ? "Dépublication lancée. Les canaux connectés seront mis à jour."
                : "Publication lancée. Les canaux connectés seront mis à jour.",
            );
            router.refresh();
          } catch (err) {
            setPublishMsg(err instanceof Error ? err.message : String(err));
          }
        });
      },
      () => {
        setPublishMsg("Corrige les champs en rouge avant de publier.");
      },
    )();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div id="prix" className="scroll-mt-24">
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

      <div id="description" className="space-y-3 scroll-mt-24">
        <label className="block text-sm font-medium">Description (FR)</label>

        <div className="bg-gray-50 border rounded p-3 space-y-3">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            Assistant de description
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Type de boîte</label>
              <select
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value as BodyType)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              >
                {BODY_TYPES_ORDER.map((b) => (
                  <option key={b} value={b}>
                    {BODY_TYPE_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
            {needsLength && (
              <div>
                <label className="block text-xs text-gray-600 mb-1">Longueur boîte (pieds)</label>
                <input
                  type="number"
                  min={10}
                  max={40}
                  value={tplLength}
                  onChange={(e) => setTplLength(e.target.value)}
                  placeholder="20"
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
            )}
            {needsBrand && (
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">
                  Marque équipement {tplBody === "fourgon_montecharge" ? "(monte-charge)" : "(unité de réfrig.)"}
                </label>
                <input
                  type="text"
                  value={tplBrand}
                  onChange={(e) => setTplBrand(e.target.value)}
                  placeholder={
                    tplBody === "fourgon_montecharge" ? "Maxon TE-20" : "ATC"
                  }
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-700">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={tplReadyToWork} onChange={(e) => setTplReadyToWork(e.target.checked)} />
              Prêt à travailler
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={tplExcellent} onChange={(e) => setTplExcellent(e.target.checked)} />
              Excellente condition
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={tplAlmostNew} onChange={(e) => setTplAlmostNew(e.target.checked)} />
              Camion presque neuf
            </label>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Inspection SAAQ (optionnel)</label>
            <input
              type="text"
              value={tplSaaq}
              onChange={(e) => setTplSaaq(e.target.value)}
              placeholder="Mars 2023"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={onSuggestClick}
            disabled={isDescPending}
            className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded hover:bg-blue-800 disabled:opacity-50"
          >
            {isDescPending ? "Création..." : "Créer une description"}
          </button>
          {descMsg && <p className="text-xs text-gray-600">{descMsg}</p>}
        </div>

        <textarea
          {...register("description_fr")}
          rows={10}
          className="w-full border rounded px-3 py-2 font-mono text-sm"
        />
        {errors.description_fr && (
          <p className="text-sm text-red-600 mt-1">{errors.description_fr.message}</p>
        )}
      </div>

      <div id="canaux" className="scroll-mt-24">
        <label className="block text-sm font-medium mb-2">Où publier</label>
        <div className="grid grid-cols-2 gap-2">
          {CHANNELS.map((c) => {
            const available = channelAvailability[c];
            const disabled = !available.ready;
            return (
              <label
                key={c}
                className={
                  "flex items-start gap-2 text-sm rounded border px-2 py-2 " +
                  (disabled
                    ? "border-gray-200 bg-gray-50 text-gray-400"
                    : "border-gray-200 bg-white text-gray-800")
                }
                title={available.reason}
              >
                <input
                  type="checkbox"
                  value={c}
                  disabled={disabled}
                  {...register("channels")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block">{CHANNEL_LABELS[c]}</span>
                  <span className={disabled ? "text-xs text-gray-400" : "text-xs text-gray-500"}>
                    {available.reason}
                  </span>
                </span>
              </label>
            );
          })}
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
          {isSubmitting ? "Enregistrement..." : "Enregistrer"}
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
              ? "Retirer l'annonce"
              : "Publier l'annonce"}
        </button>
      </div>
      {publishMsg && <p className="text-sm text-red-600">{publishMsg}</p>}
      {showConfirm && (
        <ConfirmPublishModal
          isPublished={isPublished}
          unit={unit}
          selectedChannels={confirmChannels}
          channelAvailability={channelAvailability}
          onCancel={() => setShowConfirm(false)}
          onConfirm={confirmTogglePublish}
        />
      )}
      {showOverwrite && (
        <ConfirmOverwriteModal
          onCancel={() => setShowOverwrite(false)}
          onConfirm={() => {
            setShowOverwrite(false);
            applySuggestion();
          }}
        />
      )}
    </form>
  );
}

function ConfirmOverwriteModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-2">Remplacer la description?</h2>
        <p className="text-sm text-gray-600 mb-5">
          Une description existe déjà. La nouvelle version va la remplacer. Continuer?
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded border text-sm"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded bg-blue-700 text-white text-sm"
          >
            Remplacer
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmPublishModal({
  isPublished,
  unit,
  selectedChannels,
  channelAvailability,
  onCancel,
  onConfirm,
}: {
  isPublished: boolean;
  unit: string;
  selectedChannels: Channel[];
  channelAvailability: ChannelAvailability;
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
            ? "Le formulaire sera sauvegardé, puis le véhicule sera retiré des canaux sélectionnés."
            : "Le formulaire sera sauvegardé, puis le véhicule sera publié sur les canaux sélectionnés."}
        </p>
        <ul className="text-sm space-y-1.5 mb-5">
          {selectedChannels.map((channel) => (
            <li key={channel} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span>{CHANNEL_LABELS[channel]}</span>
              <span className="text-xs text-gray-500 ml-auto">
                {channelAvailability[channel].ready
                  ? CHANNEL_TIMING[channel]
                  : channelAvailability[channel].reason}
              </span>
            </li>
          ))}
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
