"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CHANNELS,
  listingFormSchema,
  type Channel,
  type ListingFormInput,
} from "@/lib/listings/schema";
import {
  generateAssistedListingDescription,
  setListingChannelPublished,
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
  no_channels: "Choisis au moins une plateforme, ou utilise le bouton Publier dans la ligne voulue.",
};

const CHANNEL_LABELS: Record<Channel, string> = {
  native: "Fiche véhicule",
  wix: "Page Inventaire (Wix)",
  fb_marketplace: "Facebook Marketplace",
  fb_page: "Page Facebook",
  google_vla: "Google Vehicle Ads",
  lespac: "LesPAC",
  kijiji: "Kijiji (à connecter)",
  truckpaper: "TruckPaper",
  marketbook: "MarketBook",
};

const CHANNEL_DESCRIPTIONS: Record<Channel, string> = {
  native: "Lien public de la fiche détaillée",
  wix: "Bloc Inventaire visible sur le site Hino",
  fb_marketplace: "Catalogue Meta Marketplace",
  fb_page: "Publication native sur la page Facebook",
  google_vla: "Feed Google Vehicle Ads",
  lespac: "Annonce publiée via l'API LesPAC",
  kijiji: "Connecteur Kijiji",
  truckpaper: "Envoi automatique vers TruckPaper",
  marketbook: "Envoi automatique vers MarketBook",
};

const SYNC_DONE_STATUSES = new Set([
  "published",
  "saved",
  "upserted",
  "posted",
  "feed_ready",
  "ok",
  "claimed",
]);
const SYNC_ACTIVE_STATUSES = new Set(["triggered", "queued"]);

type PendingChannelAction = {
  channel: Channel;
  publish: boolean;
};

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
}

export interface PublicationReadiness {
  hasDescription: boolean;
  photoCount: number;
  hasHero: boolean;
  available: boolean;
}

export interface ChannelStateSnapshot {
  channel: string;
  last_status: string | null;
  last_synced_at?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  last_error: string | null;
}

export default function ListingForm({
  unit,
  defaults,
  isPublished,
  vehicle,
  channelAvailability,
  readiness,
  channelState,
}: {
  unit: string;
  defaults: ListingFormInput;
  isPublished: boolean;
  vehicle: VehicleContext;
  channelAvailability: ChannelAvailability;
  readiness: PublicationReadiness;
  channelState: ChannelStateSnapshot[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDescPending, startDescTransition] = useTransition();
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [descMsg, setDescMsg] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChannels, setConfirmChannels] = useState<Channel[]>([]);
  const [pendingChannelAction, setPendingChannelAction] =
    useState<PendingChannelAction | null>(null);
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
    control,
  } = useForm<ListingFormInput>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      ...defaults,
      channels: sanitizeChannels(defaults.channels),
    },
  });

  function sanitizeChannels(channels: readonly Channel[]): Channel[] {
    return channels.filter((c) => channelAvailability[c]?.ready);
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
  const watchedChannels = useWatch({ control, name: "channels" });
  const selectedChannels = new Set(watchedChannels ?? []);
  const selectedReadyChannels = CHANNELS.filter(
    (c) => selectedChannels.has(c) && channelAvailability[c]?.ready,
  );

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

  function buildChannelActionInput(action: PendingChannelAction): ListingFormInput {
    const values = getValues();
    const current = sanitizeChannels(values.channels ?? []);
    const channels = action.publish
      ? current.includes(action.channel)
        ? current
        : [...current, action.channel]
      : current.filter((channel) => channel !== action.channel);
    return { ...values, channels };
  }

  function confirmPlatformAction() {
    const action = pendingChannelAction;
    if (!action) return;
    setPendingChannelAction(null);
    setPublishMsg(null);
    startTransition(async () => {
      try {
        const clean = buildChannelActionInput(action);
        const result = await setListingChannelPublished(
          unit,
          clean,
          action.channel,
          action.publish,
        );
        if (!result.ok) {
          setPublishMsg(PUBLICATION_ERROR_MSG[result.error]);
          return;
        }
        reset({ ...clean, channels: result.channels });
        setPublishMsg(`${CHANNEL_LABELS[action.channel]}: c'est fait.`);
        router.refresh();
      } catch (err) {
        setPublishMsg(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div id="prix" className="scroll-mt-24">
        <label className="block text-sm font-medium mb-1">Prix interne CAD</label>
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

      <div id="canaux" className="scroll-mt-24 space-y-3">
        <PublicationSteps
          isPublished={isPublished}
          isDirty={isDirty}
          readiness={readiness}
          selectedChannels={selectedReadyChannels}
          channelState={channelState}
        />

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <label className="block text-sm font-medium">Plateformes et état réel</label>
            <p className="text-xs text-gray-500 mt-0.5">
              Choisir où publier et voir ce qui est fait ou à faire.
            </p>
          </div>
          <span
            className={
              "inline-flex px-2 py-0.5 rounded text-xs font-medium " +
              (isPublished
                ? "bg-emerald-100 text-emerald-800"
                : "bg-gray-100 text-gray-700")
            }
          >
            {isPublished ? "Annonce publiée" : "Brouillon"}
          </span>
        </div>

        <PlatformPublicationList
          isPublished={isPublished}
          isPending={isPending}
          selectedChannels={selectedChannels}
          channelAvailability={channelAvailability}
          channelState={channelState}
          register={register}
          onChannelAction={(channel, publish) => {
            setPublishMsg(null);
            setPendingChannelAction({ channel, publish });
          }}
        />
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
      {pendingChannelAction && (
        <ConfirmPlatformActionModal
          action={pendingChannelAction}
          unit={unit}
          onCancel={() => setPendingChannelAction(null)}
          onConfirm={confirmPlatformAction}
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

function PublicationSteps({
  isPublished,
  isDirty,
  readiness,
  selectedChannels,
  channelState,
}: {
  isPublished: boolean;
  isDirty: boolean;
  readiness: PublicationReadiness;
  selectedChannels: Channel[];
  channelState: ChannelStateSnapshot[];
}) {
  const missing = [
    !readiness.available ? "SERTI disponible" : null,
    !readiness.hasDescription ? "description" : null,
    readiness.photoCount === 0 ? "photos" : null,
    !readiness.hasHero ? "photo principale" : null,
  ].filter((v): v is string => Boolean(v));
  const readyToPublish = missing.length === 0 && selectedChannels.length > 0;
  const sync = summarizeSync(isPublished, selectedChannels, channelState);

  return (
    <div className="border rounded bg-gray-50">
      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x">
        <PublicationStep
          number={1}
          label="Fiche"
          status={missing.length === 0 ? "Prête" : "À compléter"}
          detail={missing.length === 0 ? "Description et photos OK" : missing.join(", ")}
          tone={missing.length === 0 ? "done" : "active"}
        />
        <PublicationStep
          number={2}
          label="Plateformes"
          status={
            selectedChannels.length > 0
              ? `${selectedChannels.length} sélectionnée${selectedChannels.length > 1 ? "s" : ""}`
              : "Au choix"
          }
          detail={
            selectedChannels.length > 0
              ? selectedChannels.map((c) => CHANNEL_LABELS[c]).join(", ")
              : "Publier seulement où c'est nécessaire"
          }
          tone={selectedChannels.length > 0 ? "done" : "waiting"}
        />
        <PublicationStep
          number={3}
          label="Publication"
          status={
            isPublished
              ? isDirty
                ? "À enregistrer"
                : "Publiée"
              : readyToPublish
                ? "Prête"
                : "Brouillon"
          }
          detail={
            isPublished
              ? isDirty
                ? "Sauvegarder pour appliquer les changements"
                : "Annonce active"
              : readyToPublish
                ? "Le bouton Publier peut être utilisé"
                : "Compléter les étapes précédentes"
          }
          tone={isPublished ? (isDirty ? "active" : "done") : readyToPublish ? "active" : "waiting"}
        />
        <PublicationStep
          number={4}
          label="Résultat"
          status={sync.status}
          detail={sync.detail}
          tone={sync.tone}
        />
      </div>
    </div>
  );
}

function summarizeSync(
  isPublished: boolean,
  selectedChannels: Channel[],
  channelState: ChannelStateSnapshot[],
): { status: string; detail: string; tone: StepTone } {
  if (selectedChannels.length === 0) {
    return { status: "Aucune active", detail: "Publier une plateforme au besoin", tone: "waiting" };
  }
  if (!isPublished) {
    return { status: "Brouillon", detail: "Rien n'est publié", tone: "waiting" };
  }

  const byChannel = new Map(channelState.map((s) => [s.channel, s]));
  let pending = 0;
  let error = 0;
  for (const channel of selectedChannels) {
    const state = byChannel.get(channel);
    const status = state?.last_status ?? null;
    if (state?.last_error || status === "error") {
      error += 1;
    } else if (status && SYNC_DONE_STATUSES.has(status)) {
      continue;
    } else if (status && SYNC_ACTIVE_STATUSES.has(status)) {
      pending += 1;
    } else {
      pending += 1;
    }
  }

  if (error > 0) {
    return {
      status: "À vérifier",
      detail: "Voir les plateformes ci-dessous",
      tone: "blocked",
    };
  }
  if (pending > 0) {
    return {
      status: "En cours",
      detail: "Voir la ligne de la plateforme",
      tone: "active",
    };
  }
  return {
    status: "À jour",
    detail: "Plateformes choisies synchronisées",
    tone: "done",
  };
}

type StepTone = "done" | "active" | "waiting" | "blocked";

function PublicationStep({
  number,
  label,
  status,
  detail,
  tone,
}: {
  number: number;
  label: string;
  status: string;
  detail: string;
  tone: StepTone;
}) {
  const toneClass: Record<StepTone, string> = {
    done: "bg-emerald-100 text-emerald-800 border-emerald-200",
    active: "bg-blue-100 text-blue-800 border-blue-200",
    waiting: "bg-gray-100 text-gray-700 border-gray-200",
    blocked: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <div className="p-3 min-w-0">
      <div className="flex items-center gap-2">
        <span
          className={
            "inline-flex w-6 h-6 items-center justify-center rounded-full border text-xs font-semibold " +
            toneClass[tone]
          }
        >
          {number}
        </span>
        <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
          {label}
        </span>
      </div>
      <div className="mt-2 text-sm font-semibold text-gray-900 truncate">{status}</div>
      <div className="mt-0.5 text-xs text-gray-500 line-clamp-2">{detail}</div>
    </div>
  );
}

type PlatformTone = "done" | "active" | "waiting" | "blocked" | "disabled";

function PlatformPublicationList({
  isPublished,
  isPending,
  selectedChannels,
  channelAvailability,
  channelState,
  register,
  onChannelAction,
}: {
  isPublished: boolean;
  isPending: boolean;
  selectedChannels: Set<Channel>;
  channelAvailability: ChannelAvailability;
  channelState: ChannelStateSnapshot[];
  register: UseFormRegister<ListingFormInput>;
  onChannelAction: (channel: Channel, publish: boolean) => void;
}) {
  const byChannel = new Map(channelState.map((s) => [s.channel, s]));
  const rows = CHANNELS.map((channel) => {
    const selected = selectedChannels.has(channel);
    const available = channelAvailability[channel];
    return {
      channel,
      selected,
      available,
      state: byChannel.get(channel),
      status: platformStatus({
        available,
        isPublished,
        selected,
        state: byChannel.get(channel),
      }),
    };
  });
  const blockedCount = rows.filter((row) => row.status.tone === "blocked").length;

  return (
    <div className="border rounded overflow-hidden bg-white">
      <div className="px-3 py-2 bg-gray-50 border-b">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-gray-500 font-semibold">
          <span>Plateforme</span>
          <span>Publier seulement où c&apos;est nécessaire</span>
        </div>
        {blockedCount > 0 && (
          <div className="mt-2">
            <StatusPill label="À vérifier" tone="blocked" />
          </div>
        )}
      </div>
      <div className="divide-y">
        {rows.map(({ channel, selected, available, state, status }) => {
          const action = platformPrimaryAction({ isPublished, selected, status });
          return (
            <div
              key={channel}
              className={
                "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-3 py-3 text-sm " +
                (status.tone === "blocked"
                  ? "bg-red-50/70"
                  : selected && available.ready
                    ? "bg-blue-50/60"
                    : "bg-white")
              }
              title={status.detail}
            >
              <label className="mt-1">
                <input
                  type="checkbox"
                  value={channel}
                  disabled={!available.ready}
                  aria-label={CHANNEL_LABELS[channel]}
                  {...register("channels")}
                />
              </label>
              <span className="min-w-0">
                <span
                  className={
                    "block font-medium truncate " +
                    (!available.ready ? "text-gray-400" : "text-gray-900")
                  }
                >
                  {CHANNEL_LABELS[channel]}
                </span>
                <span className="block text-xs text-gray-500 truncate">
                  {CHANNEL_DESCRIPTIONS[channel]}
                </span>
                <span
                  className={
                    "block text-xs mt-0.5 " +
                    (status.tone === "blocked"
                      ? "text-red-700"
                      : !available.ready
                        ? "text-gray-400"
                        : "text-gray-700")
                  }
                >
                  {status.detail}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1 min-w-[124px]">
                <StatusPill label={status.label} tone={status.tone} />
                {action && available.ready ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onChannelAction(channel, action.publish);
                    }}
                    className={
                      "rounded px-2 py-1 text-xs font-medium disabled:opacity-50 " +
                      (action.publish
                        ? "bg-green-700 text-white hover:bg-green-800"
                        : "bg-gray-200 text-gray-800 hover:bg-gray-300")
                    }
                  >
                    {isPending ? "..." : action.label}
                  </button>
                ) : null}
                {state?.external_url && status.tone === "done" ? (
                  <a
                    href={state.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-700 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    ouvrir
                  </a>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function platformPrimaryAction({
  isPublished,
  selected,
  status,
}: {
  isPublished: boolean;
  selected: boolean;
  status: { label: string; tone: PlatformTone };
}): { label: string; publish: boolean } | null {
  if (status.tone === "disabled") return null;
  const live = selected && isPublished && (status.tone === "done" || status.label === "En cours");
  return live ? { label: "Retirer", publish: false } : { label: "Publier", publish: true };
}

function platformStatus({
  available,
  isPublished,
  selected,
  state,
}: {
  available: { ready: boolean; reason: string };
  isPublished: boolean;
  selected: boolean;
  state: ChannelStateSnapshot | undefined;
}): { label: string; detail: string; tone: PlatformTone } {
  if (!available.ready) {
    return { label: "Non disponible", detail: available.reason, tone: "disabled" };
  }
  if (!selected) {
    return {
      label: "Optionnel",
      detail: "Pas choisi pour ce véhicule.",
      tone: "waiting",
    };
  }
  if (!isPublished) {
    return {
      label: "À publier",
      detail: "Sélectionnée. Cliquer sur Publier l'annonce pour l'envoyer.",
      tone: "active",
    };
  }

  const rawStatus = state?.last_status ?? null;
  if (state?.last_error || rawStatus === "error") {
    return {
      label: "À vérifier",
      detail: state?.last_error ?? "La dernière synchronisation a échoué.",
      tone: "blocked",
    };
  }
  if (rawStatus && SYNC_ACTIVE_STATUSES.has(rawStatus)) {
    return {
      label: "En cours",
      detail: "La demande a été envoyée. En attente d'une confirmation.",
      tone: "active",
    };
  }
  if (rawStatus && SYNC_DONE_STATUSES.has(rawStatus)) {
    return {
      label: rawStatus === "feed_ready" ? "En attente plateforme" : "Fait",
      detail: rawStatus === "feed_ready"
        ? "Rien à faire ici. Cette annonce est dans le fichier que la plateforme récupère."
        : state?.last_synced_at
          ? `Dernière mise à jour: ${new Date(state.last_synced_at).toLocaleString("fr-CA")}`
          : "Synchronisé.",
      tone: "done",
    };
  }
  if (rawStatus === "unpublished" || rawStatus === "removed") {
    return {
      label: "À publier",
      detail: "Sélectionnée, mais pas encore active sur cette plateforme.",
      tone: "active",
    };
  }
  if (rawStatus === "skipped") {
    return {
      label: "À publier",
      detail: "Cette plateforme a été ignorée lors de la dernière synchronisation. Publier à nouveau pour réessayer.",
      tone: "active",
    };
  }
  return {
    label: "En attente",
    detail: "Sélectionnée, mais aucune confirmation de synchronisation n'est encore disponible.",
    tone: "active",
  };
}

function StatusPill({ label, tone }: { label: string; tone: PlatformTone }) {
  const classes: Record<PlatformTone, string> = {
    done: "bg-emerald-100 text-emerald-800 border-emerald-200",
    active: "bg-blue-100 text-blue-800 border-blue-200",
    waiting: "bg-gray-100 text-gray-700 border-gray-200",
    blocked: "bg-red-100 text-red-800 border-red-200",
    disabled: "bg-gray-50 text-gray-400 border-gray-200",
  };
  return (
    <span
      className={
        "inline-flex items-center justify-center rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap " +
        classes[tone]
      }
    >
      {label}
    </span>
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

function ConfirmPlatformActionModal({
  action,
  unit,
  onCancel,
  onConfirm,
}: {
  action: PendingChannelAction;
  unit: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const verb = action.publish ? "Publier" : "Retirer";
  const platform = CHANNEL_LABELS[action.channel];
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
          {verb} {unit} sur {platform}?
        </h2>
        <p className="text-sm text-gray-600 mb-5">
          {action.publish
            ? "Le formulaire sera sauvegardé, puis cette plateforme seulement sera publiée."
            : "Le formulaire sera sauvegardé, puis cette plateforme seulement sera retirée."}
        </p>
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
              (action.publish ? "bg-green-700 hover:bg-green-800" : "bg-gray-700 hover:bg-gray-800")
            }
          >
            C&apos;est fait
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
                  ? "Sélectionné pour cette opération"
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
            C&apos;est fait
          </button>
        </div>
      </div>
    </div>
  );
}
