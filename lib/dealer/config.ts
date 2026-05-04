export interface DealerAddress {
  addr1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface DealerContact {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export interface DealerConfig {
  name: string;
  address: DealerAddress;
  contact: DealerContact;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getDealerConfig(): DealerConfig {
  return {
    name: clean(process.env.DEALER_NAME) ?? "Centre du camion Hino",
    address: {
      addr1:
        clean(process.env.DEALER_ADDRESS_LINE1) ??
        clean(process.env.DEALER_NAME) ??
        "Centre du camion Hino",
      city: clean(process.env.DEALER_CITY) ?? "Chicoutimi",
      region: clean(process.env.DEALER_REGION) ?? "QC",
      postalCode: clean(process.env.DEALER_POSTAL_CODE) ?? "",
      country: clean(process.env.DEALER_COUNTRY) ?? "CA",
    },
    contact: {
      email: clean(process.env.DEALER_CONTACT_EMAIL),
      firstName: clean(process.env.DEALER_CONTACT_FIRST_NAME),
      lastName: clean(process.env.DEALER_CONTACT_LAST_NAME),
      phone: clean(process.env.DEALER_CONTACT_PHONE),
    },
  };
}

export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const normalized = phone.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : null;
}
