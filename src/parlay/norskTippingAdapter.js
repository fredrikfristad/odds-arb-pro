export const NORSK_TIPPING_KEYS = new Set([
  "norsk_tipping",
  "norsktipping",
  "norsk tipping",
  "norsk-tipping",
]);

export const isNorskTippingBookmaker = (bookmaker) => {
  const key = String(bookmaker?.bookmakerKey || bookmaker?.bookmaker || bookmaker?.bookmakerName || "").toLowerCase();
  const name = String(bookmaker?.bookmakerName || bookmaker?.bookmaker || bookmaker?.bookmakerKey || "").toLowerCase();
  return NORSK_TIPPING_KEYS.has(key) || NORSK_TIPPING_KEYS.has(name) || name.includes("norsk tipping");
};

export const norskTippingUrl = (fallbackUrl) => fallbackUrl || "https://www.norsk-tipping.no/sport";
