/** Single in-flight download of Kite instruments CSV (shared by chain + search + technicals). */

let csvPromise: Promise<string> | null = null;
let csvLoadedAt = 0;
const CSV_TTL_MS = 4 * 60 * 60 * 1000;

export function isInstrumentsCsvFresh(): boolean {
  return csvLoadedAt > 0 && Date.now() - csvLoadedAt < CSV_TTL_MS;
}

export async function fetchKiteInstrumentsCsv(force = false): Promise<string> {
  if (!force && isInstrumentsCsvFresh() && csvPromise) {
    return csvPromise;
  }

  if (!force && csvPromise) {
    return csvPromise;
  }

  csvPromise = fetch("https://api.kite.trade/instruments")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load Kite instruments (${response.status})`);
      }
      const text = await response.text();
      csvLoadedAt = Date.now();
      return text;
    })
    .catch((err) => {
      csvPromise = null;
      csvLoadedAt = 0;
      throw err;
    });

  return csvPromise;
}

export function warmKiteInstrumentsCsv(): void {
  void fetchKiteInstrumentsCsv().catch((err) => {
    console.warn("Kite instruments preload failed:", err.message);
  });
}
