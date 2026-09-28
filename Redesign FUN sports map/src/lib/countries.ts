/**
 * Countries for the sign-up form. The country decides the minimum age (see
 * `min_age_by_country`), so it is a required, explicit choice — prefilled from the
 * visitor's IP or browser locale, never silently assumed.
 */

/** ISO 3166-1 alpha-2. */
export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

const CODE_SET = new Set<string>(COUNTRY_CODES);

export function isCountryCode(value: string | null | undefined): value is string {
  return !!value && CODE_SET.has(value.trim().toUpperCase());
}

/** Names in the visitor's language, sorted for a select. */
export function countryOptions(locale?: string): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(locale ? [locale] : undefined, { type: "region" });
  } catch {
    names = null;
  }
  return COUNTRY_CODES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );
}

export function countryName(code: string, locale?: string): string {
  try {
    return new Intl.DisplayNames(locale ? [locale] : undefined, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The region in the browser's language tags (`en-GB` → `GB`), if any. */
export function countryFromLocale(languages: readonly string[]): string | null {
  for (const tag of languages) {
    const region = tag.split("-").slice(1).find((part) => /^[A-Za-z]{2}$/.test(part));
    if (region && isCountryCode(region)) return region.toUpperCase();
  }
  return null;
}
