export type SolarLocale = "es" | "en";

export function formatNumber(value: number, locale: SolarLocale, digits = 2): string {
  return value.toLocaleString(locale === "es" ? "es-MX" : "en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatSci(coeff: number, exp: number, unit: string, locale: SolarLocale): string {
  const c = coeff.toLocaleString(locale === "es" ? "es-MX" : "en-US", { maximumFractionDigits: 3 });
  return `${c} × 10${toSuper(exp)} ${unit}`;
}

function toSuper(n: number): string {
  const map: Record<string, string> = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻",
  };
  return String(n).split("").map((ch) => map[ch] ?? ch).join("");
}

export function formatDays(days: number, locale: SolarLocale): string {
  const abs = Math.abs(days);
  if (abs < 1) {
    const hours = abs * 24;
    if (hours < 1) return `${formatNumber(hours * 60, locale, 0)} min`;
    return `${formatNumber(hours, locale, 1)} h`;
  }
  if (abs < 365) return `${formatNumber(abs, locale, abs >= 10 ? 1 : 2)} ${locale === "es" ? "días" : "days"}`;
  const years = abs / 365.25;
  return `${formatNumber(years, locale, years >= 10 ? 1 : 2)} ${locale === "es" ? "años" : "years"}`;
}

export function formatDate(date: Date, locale: SolarLocale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatSpeed(daysPerSec: number, locale: SolarLocale): string {
  const d = locale === "es" ? "d/s" : "d/s";
  if (daysPerSec < 1) return `${formatNumber(daysPerSec, locale, 2)} ${d}`;
  if (daysPerSec < 10) return `${formatNumber(daysPerSec, locale, 1)} ${d}`;
  return `${formatNumber(daysPerSec, locale, 0)} ${d}`;
}

export function yearDurationLabel(daysPerSec: number, locale: SolarLocale): string {
  const seconds = 365.256 / Math.max(daysPerSec, 1e-6);
  const prefix = locale === "es" ? "1 año en" : "1 year in";
  if (seconds < 1) return `${prefix} ${formatNumber(seconds * 1000, locale, 0)} ms`;
  if (seconds < 90) return `${prefix} ${formatNumber(seconds, locale, 1)} s`;
  return `${prefix} ${formatNumber(seconds / 60, locale, 1)} min`;
}
