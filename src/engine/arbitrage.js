const round2 = (value) => Math.round(value * 100) / 100;
const round4 = (value) => Math.round(value * 10000) / 10000;

const REQUIRED_OUTCOMES = {
  "1x2": 3,
  over_under: 2,
  btts: 2,
  spread: 2,
};

const validOdd = (odd) => Number.isFinite(odd?.decimalOdds) && odd.decimalOdds > 1;

const bestOddsForOutcome = (outcome) => {
  const valid = (outcome.odds || []).filter(validOdd);
  if (!valid.length) return [];
  const bestPrice = Math.max(...valid.map((odd) => odd.decimalOdds));
  return valid.filter((odd) => odd.decimalOdds === bestPrice);
};

const isCompleteMarket = (market) => {
  const requiredCount = REQUIRED_OUTCOMES[market.type];
  if (!requiredCount || !Array.isArray(market.outcomes) || market.outcomes.length < requiredCount) {
    return false;
  }

  return market.outcomes.slice(0, requiredCount).every((outcome) => bestOddsForOutcome(outcome).length > 0);
};

export const calculateStakeDistribution = (legs, totalStake = 1000) => {
  const arbitrageSum = legs.reduce((sum, leg) => sum + (1 / leg.odds), 0);
  const expectedPayout = totalStake / arbitrageSum;

  return legs.map((leg) => {
    const stake = (totalStake / leg.odds) / arbitrageSum;
    return {
      ...leg,
      stake: round2(stake),
      expectedPayout: round2(stake * leg.odds),
    };
  }).map((leg) => ({
    ...leg,
    guaranteedProfit: round2(leg.expectedPayout - totalStake),
  }));
};

export const calculateArbitrageOpportunities = (matches, {
  totalStake = 1000,
  includeNearArb = false,
  nearArbThreshold = 1,
} = {}) => {
  const opportunities = [];

  for (const match of matches || []) {
    for (const market of match.markets || []) {
      if (!isCompleteMarket(market)) continue;

      const requiredCount = REQUIRED_OUTCOMES[market.type];
      const bestLegs = market.outcomes.slice(0, requiredCount).map((outcome) => {
        const bestOdds = bestOddsForOutcome(outcome);
        const selected = bestOdds[0];
        return {
          outcomeId: outcome.id,
          outcomeLabel: outcome.label,
          odds: selected.decimalOdds,
          bookmaker: selected.bookmakerName || selected.bookmaker,
          bookmakerKey: selected.bookmaker,
          bookmakerUrl: selected.bookmakerUrl,
          fetchedAt: selected.fetchedAt,
          tiedBookmakers: bestOdds.map((odd) => ({
            bookmaker: odd.bookmakerName || odd.bookmaker,
            bookmakerKey: odd.bookmaker,
            bookmakerUrl: odd.bookmakerUrl,
          })),
        };
      });

      const arbitrageSum = bestLegs.reduce((sum, leg) => sum + (1 / leg.odds), 0);
      const isArbitrage = arbitrageSum < 1;
      const isNearArbitrage = !isArbitrage && includeNearArb && arbitrageSum <= nearArbThreshold;
      if (!isArbitrage && !isNearArbitrage) continue;

      const legs = calculateStakeDistribution(bestLegs, totalStake);
      const expectedPayout = totalStake / arbitrageSum;
      const guaranteedProfit = expectedPayout - totalStake;

      opportunities.push({
        id: `${match.id}-${market.id}`,
        matchId: match.id,
        match,
        marketId: market.id,
        marketType: market.type,
        marketLabel: market.label,
        status: match.status,
        startsAt: match.startsAt,
        arbitrageSum: round4(arbitrageSum),
        profitMargin: round4((1 / arbitrageSum) - 1),
        profitMarginPct: round2(((1 / arbitrageSum) - 1) * 100),
        isArbitrage,
        isNearArbitrage,
        totalStake,
        expectedPayout: round2(expectedPayout),
        guaranteedProfit: round2(guaranteedProfit),
        legs,
      });
    }
  }

  return opportunities.sort((a, b) => b.profitMargin - a.profitMargin);
};

export const SUPPORTED_ARBITRAGE_MARKETS = Object.keys(REQUIRED_OUTCOMES);
