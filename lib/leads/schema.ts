import { z } from "zod";

export const leadFormSchema = z
  .object({
    unit: z.string().min(1),
    name: z.string().trim().min(2, "Nom trop court").max(120),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    email: z.string().trim().max(200).optional().or(z.literal("")),
    message: z.string().trim().max(4000).optional().or(z.literal("")),
    // Honeypot — doit rester vide. Bots auto-remplissent les champs cachés.
    website: z.string().max(0).optional().or(z.literal("")),
  })
  .refine((d) => Boolean(d.phone?.trim() || d.email?.trim()), {
    message: "Un téléphone OU un courriel est requis",
    path: ["phone"],
  })
  .refine(
    (d) => !d.email || d.email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email),
    { message: "Courriel invalide", path: ["email"] },
  );

export type LeadFormInput = z.infer<typeof leadFormSchema>;
