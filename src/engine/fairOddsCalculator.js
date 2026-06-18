const round2 = (value) => Math.round(value * 100) / 100;
const round4 = (value) => Math.round(value * 10000) / 10000;

export const impliedProbabilityFromOdds = (decimalOdds) => {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return null;
  return round4(1 / decimalOdds);
};

export const fairOddsFromProbability = (probability) => {
  if (!Number.isFinite(probability) || probability <= 0) return null;
  return round2(1 / probability);
};

export const valueEdgePct = (bookmakerOdds, fairOdds) => {
  if (!Number.isFinite(bookmakerOdds) || !Number.isFinite(fairOdds) || bookmakerOdds <= 1 || fairOdds <= 1) return null;
  return round2(((bookmakerOdds / fairOdds) - 1) * 100);
};

export const expectedValuePct = (probability, bookmakerOdds) => {
  if (!Number.isFinite(probability) || !Number.isFinite(bookmakerOdds) || bookmakerOdds <= 1) return null;
  return round2(((probability * bookmakerOdds) - 1) * 100);
};

export const classifyValue = ({ valueEdge, isArbitrage = false }) => {
  if (isArbitrage) return { label: "⚡ Arbitrage", type: "arbitrage" };
  if (valueEdge >= 100) return { label: "🔥 Elite Value", type: "elite" };
  if (valueEdge >= 8) return { label: "💎 Value Bet", type: "value" };
  if (valueEdge <= -8) return { label: "⚠️ Overpriced", type: "overpriced" };
  return { label: "Fair", type: "fair" };
};
