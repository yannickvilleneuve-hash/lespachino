export interface LespacConfig {
  token: string;
  baseUrl: string;
  dealer: {
    postalCode: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
}

export function getLespacConfig(): LespacConfig {
  const token = process.env.LESPAC_API_TOKEN;
  const baseUrl = (process.env.LESPAC_API_BASE ?? "https://ws.lespac.com").replace(/\/+$/, "");
  const postalCode = process.env.DEALER_POSTAL_CODE;
  const email = process.env.DEALER_CONTACT_EMAIL;
  const firstName = process.env.DEALER_CONTACT_FIRST_NAME;
  const lastName = process.env.DEALER_CONTACT_LAST_NAME;
  const phone = process.env.DEALER_CONTACT_PHONE;

  const missing: string[] = [];
  if (!token) missing.push("LESPAC_API_TOKEN");
  if (!postalCode) missing.push("DEALER_POSTAL_CODE");
  if (!email) missing.push("DEALER_CONTACT_EMAIL");
  if (!firstName) missing.push("DEALER_CONTACT_FIRST_NAME");
  if (!lastName) missing.push("DEALER_CONTACT_LAST_NAME");
  if (!phone) missing.push("DEALER_CONTACT_PHONE");
  if (missing.length > 0) {
    throw new Error(`Variables manquantes pour Lespac: ${missing.join(", ")}`);
  }

  return {
    token: token!,
    baseUrl,
    dealer: {
      postalCode: postalCode!,
      email: email!,
      firstName: firstName!,
      lastName: lastName!,
      phone: phone!,
    },
  };
}

export function isLespacReady(): boolean {
  try {
    getLespacConfig();
    return true;
  } catch {
    return false;
  }
}
