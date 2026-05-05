export const PUBLIC_PRICE_FALLBACK_LABEL = "prix sur demande";
export const PUBLIC_PRICE_LABEL = PUBLIC_PRICE_FALLBACK_LABEL;

const publicCurrencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export function hasPublicPrice(priceCad: number | null | undefined): boolean {
  return typeof priceCad === "number" && Number.isFinite(priceCad) && priceCad > 0;
}

export function publicPriceCad(priceCad: number | null | undefined): number | null {
  return hasPublicPrice(priceCad) ? Number(priceCad) : null;
}

export function publicPriceLabel(priceCad: number | null | undefined): string {
  const price = publicPriceCad(priceCad);
  return price === null ? PUBLIC_PRICE_FALLBACK_LABEL : publicCurrencyFmt.format(price);
}

export function publicPriceAmount(priceCad: number | null | undefined): string {
  const price = publicPriceCad(priceCad);
  return price === null ? "" : price.toFixed(2);
}

export function publicPriceWithCurrency(priceCad: number | null | undefined): string {
  const amount = publicPriceAmount(priceCad);
  return amount ? `${amount} CAD` : "";
}
