import { z } from "zod";

export const AUTO_DETECT_COUNTRY = "auto";

const devCountrySchema = z
  .string()
  .length(2)
  .or(z.literal(AUTO_DETECT_COUNTRY))
  .transform((code) => (code.length === 2 ? code : null));

export function parseDevCountry(
  value: FormDataEntryValue | null
): string | null {
  const parsed = devCountrySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function devCountryChoice(country: string | null): string {
  return country ?? AUTO_DETECT_COUNTRY;
}
