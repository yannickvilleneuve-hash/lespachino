/**
 * Placeholder coloré pour véhicules sans photo. Couleur stable par unit
 * (hash) — chaque camion garde la même teinte entre les rendus.
 * SVG inline → scale automatique au conteneur, pas de CSS container query.
 */

interface Palette {
  bg: string;
  circle: string;
  text: string;
}

const PALETTES: Palette[] = [
  { bg: "#7d7e2c", circle: "#9a9b3a", text: "#ffffff" }, // olive
  { bg: "#3e8b8e", circle: "#5fa9ad", text: "#ffffff" }, // teal
  { bg: "#9c4221", circle: "#bb5a35", text: "#ffffff" }, // terracotta
  { bg: "#5b6e7a", circle: "#7a8e9b", text: "#ffffff" }, // slate blue
  { bg: "#6b4a6b", circle: "#8b6588", text: "#ffffff" }, // mauve
  { bg: "#4a6741", circle: "#658560", text: "#ffffff" }, // sage
  { bg: "#7a4444", circle: "#9c5e5e", text: "#ffffff" }, // wine
  { bg: "#3b4a6b", circle: "#5b6c8e", text: "#ffffff" }, // navy
  { bg: "#8b5a2b", circle: "#a87742", text: "#ffffff" }, // sienna
  { bg: "#46604f", circle: "#62816d", text: "#ffffff" }, // forest
];

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % mod;
}

export function VehiclePlaceholder({
  unit,
  make,
  model,
  year,
  className = "",
}: {
  unit?: string;
  make?: string;
  model?: string;
  year?: number;
  className?: string;
}) {
  const key = unit ?? `${make ?? ""}-${model ?? ""}-${year ?? ""}`;
  const c = PALETTES[hashIndex(key.length > 0 ? key : "x", PALETTES.length)];
  const title = [make, model].filter(Boolean).join(" ").toUpperCase().trim();
  // viewBox 1200x800 (ratio 3:2) — preserveAspectRatio xMidYMid slice
  // remplit le conteneur en gardant le ratio.
  return (
    <svg
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      className={"block " + className}
      role="img"
      aria-label={`Placeholder — ${unit ?? (title || "véhicule")}`}
    >
      <rect width="1200" height="800" fill={c.bg} />
      <circle cx="1080" cy="120" r="320" fill={c.circle} />
      <circle cx="120" cy="720" r="260" fill={c.circle} />
      <g fill={c.text} textAnchor="middle" fontFamily="system-ui, sans-serif">
        {unit && (
          <text x="600" y="320" fontSize="120" fontWeight="700">
            {unit}
          </text>
        )}
        {title && (
          <text x="600" y="470" fontSize="56" fontWeight="600" opacity="0.95">
            {title}
          </text>
        )}
        {year ? (
          <text x="600" y="560" fontSize="40" opacity="0.8">
            {year}
          </text>
        ) : null}
      </g>
    </svg>
  );
}
