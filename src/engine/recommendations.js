const round4 = (value) => Math.round(value * 10000) / 10000;

export const kellyStakeFraction = (probability, decimalOdds, fraction = 0.25) => {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const edge = b * probability - (1 - probability);
  return round4(Math.max(0, edge / b) * fraction);
};

export const expectedValue = (probability, decimalOdds) => round4(probability * decimalOdds - 1);

export const bestOddsForOutcome = (outcome) => outcome.odds.reduce(
  (best, odd) => odd.decimalOdds > best.decimalOdds ? odd : best,
  outcome.odds[0],
);

export const devigMarket = (outcomes) => {
  const raw = outcomes.map((outcome) => {
    const best = bestOddsForOutcome(outcome);
    return {
      id: outcome.id,
      label: outcome.label,
      best,
      implied: 1 / best.decimalOdds,
    };
  });
  const total = raw.reduce((sum, item) => sum + item.implied, 0) || 1;
  return raw.map((item) => ({
    ...item,
    marketProbability: round4(item.implied / total),
  }));
};

export const findArbitrage = (market, stake = 1000) => {
  if (!market?.outcomes?.length) return null;
  const legs = devigMarket(market.outcomes).map((outcome) => ({
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    bookmaker: outcome.best.bookmakerName || outcome.best.bookmaker,
    odds: outcome.best.decimalOdds,
    impliedProbability: 1 / outcome.best.decimalOdds,
  }));

  const impliedTotal = legs.reduce((sum, leg) => sum + leg.impliedProbability, 0);
  const isArb = impliedTotal < 1;
  const returnTarget = stake / impliedTotal;

  return {
    marketId: market.id,
    marketLabel: market.label,
    impliedTotal: round4(impliedTotal),
    margin: round4(1 - impliedTotal),
    isArb,
    isNearArb: !isArb && impliedTotal < 1.02,
    profit: isArb ? Math.round(returnTarget - stake) : 0,
    legs: legs.map((leg) => ({
      ...leg,
      stake: Math.round((stake * leg.impliedProbability) / impliedTotal),
    })),
  };
};

export const recommendMarketBets = (match, market) => {
  if (!market?.outcomes?.length) return [];

  return devigMarket(market.outcomes).map((outcome) => ({
    matchId: match.id,
    matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
    marketId: market.id,
    marketLabel: market.label,
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    bookmaker: outcome.best.bookmakerName || outcome.best.bookmaker,
    odds: outcome.best.decimalOdds,
    marketProbability: outcome.marketProbability,
    modelProbability: null,
    ev: null,
    kelly: 0,
    confidence: null,
    recommendation: "INFO",
    reason: "Ekte odds. Ingen egen statistikkmodell er koblet til, så dette vises som markedsinformasjon, ikke et bet-signal.",
  }));
};

export const recommendMatches = (matches) => matches
  .flatMap((match) => match.markets.flatMap((market) => recommendMarketBets(match, market)))
  .sort((a, b) => b.marketProbability - a.marketProbability);
