import {
  suggestDescription,
  type SuggestOptions,
  type VehicleInput,
} from "@/lib/listings/description-templates";

export type DescriptionSource = "openai" | "fallback";

export interface AssistedDescriptionResult {
  source: DescriptionSource;
  text: string;
  error?: string;
}

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function extractOutputText(data: OpenAIResponse): string {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks: string[] = [];
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function trimDescription(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
}

function vehicleLine(vehicle: VehicleInput & { color?: string; category?: string }): string {
  return [
    vehicle.year || "",
    vehicle.make,
    vehicle.model,
    vehicle.category ? `(${vehicle.category})` : "",
    vehicle.km > 0 ? `${vehicle.km.toLocaleString("fr-CA")} km` : "",
    vehicle.color ? `couleur ${vehicle.color}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function generateAssistedDescription(
  vehicle: VehicleInput & { color?: string; category?: string },
  options: SuggestOptions,
): Promise<AssistedDescriptionResult> {
  const fallback = suggestDescription(vehicle, options);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { source: "fallback", text: fallback, error: "OPENAI_API_KEY manquant" };

  const model = process.env.OPENAI_DESCRIPTION_MODEL || "gpt-5.2";
  const prompt = [
    "Rédige une description de véhicule d'occasion pour une annonce de camion Hino au Québec.",
    "Style: français québécois professionnel, concret, vendeur sans exagérer.",
    "Format: titre court, puis puces lisibles. Pas de markdown lourd. Maximum 220 mots.",
    "Ne jamais mentionner le coûtant, les marges, les données internes ou les limites de l'outil.",
    "",
    `Véhicule: ${vehicleLine(vehicle)}`,
    `Type de carrosserie: ${options.body_type}`,
    options.body_length_ft ? `Longueur: ${options.body_length_ft} pieds` : "",
    options.equipment_brand ? `Équipement: ${options.equipment_brand}` : "",
    options.saaq_inspection ? `Inspection SAAQ: ${options.saaq_inspection}` : "",
    options.ready_to_work ? "Mention souhaitée: prêt à travailler" : "",
    options.excellent_condition ? "Mention souhaitée: excellente condition" : "",
    options.almost_new ? "Mention souhaitée: camion presque neuf" : "",
    "",
    "Base locale déjà disponible, à améliorer sans inventer de specs:",
    fallback,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        input: prompt,
        instructions:
          "Tu aides un concessionnaire Hino à publier des annonces exactes. Si une donnée est absente, omets-la.",
        max_output_tokens: 900,
        text: { format: { type: "text" } },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${response.status} ${body.slice(0, 180)}`.trim());
    }
    const data = (await response.json()) as OpenAIResponse;
    const text = trimDescription(extractOutputText(data));
    if (text.length < 40) throw new Error("réponse OpenAI vide");
    return { source: "openai", text };
  } catch (err) {
    return {
      source: "fallback",
      text: fallback,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
