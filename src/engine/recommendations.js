const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round4 = (value) => Math.round(value * 10000) / 10000;

const DEFAULT_TEAM_STATS = {
  "Manchester City": { rating: 94, goalsFor: 2.35, goalsAgainst: 0.85, xgFor: 2.2, xgAgainst: 0.9, form: 0.72 },
  Liverpool: { rating: 91, goalsFor: 2.1, goalsAgainst: 0.95, xgFor: 2.0, xgAgainst: 1.0, form: 0.68 },
  Arsenal: { rating: 90, goalsFor: 2.0, goalsAgainst: 0.9, xgFor: 1.95, xgAgainst: 0.95, form: 0.66 },
  Chelsea: { rating: 84, goalsFor: 1.75, goalsAgainst: 1.25, xgFor: 1.65, xgAgainst: 1.25, form: 0.56 },
  Brazil: { rating: 92, goalsFor: 2.15, goalsAgainst: 0.9, xgFor: 2.05, xgAgainst: 0.95, form: 0.7 },
  Germany: { rating: 88, goalsFor: 1.9, goalsAgainst: 1.1, xgFor: 1.85, xgAgainst: 1.1, form: 0.62 },
  Argentina: { rating: 91, goalsFor: 2.05, goalsAgainst: 0.85, xgFor: 1.95, xgAgainst: 0.9, form: 0.69 },
  France: { rating: 92, goalsFor: 2.0, goalsAgainst: 0.8, xgFor: 1.95, xgAgainst: 0.85, form: 0.7 },
  Portugal: { rating: 89, goalsFor: 1.95, goalsAgainst: 0.95, xgFor: 1.85, xgAgainst: 0.95, form: 0.64 },
  Netherlands: { rating: 88, goalsFor: 1.85, goalsAgainst: 1.0, xgFor: 1.75, xgAgainst: 1.05, form: 0.63 },
};

export const kellyStakeFraction = (probability, decimalOdds, fraction = 0.25) => {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const edge = b * probability - (1 - probability);
  return round4(clamp((edge / b) * fraction, 0, 0.08));
};

export const expectedValue = (probability, decimalOdds) => round4(probability * decimalOdds - 1);

const bestOddsForOutcome = (outcome) => outcome.odds.reduce(
  (best, odd) => odd.decimalOdds > best.decimalOdds ? odd : best,
  outcome.odds[0],
);

const marketBaseline = (outcomes) => {
  const raw = outcomes.map((outcome) => ({
    id: outcome.id,
    label: outcome.label,
    implied: 1 / bestOddsForOutcome(outcome).decimalOdds,
  }));
  const total = raw.reduce((sum, item) => sum + item.implied, 0) || 1;
  return Object.fromEntries(raw.map((item) => [item.id, item.implied / total]));
};

const teamStrengthModel = (match, outcomes, teamStats = DEFAULT_TEAM_STATS) => {
  const home = teamStats[match.homeTeam];
  const away = teamStats[match.awayTeam];
  if (!home || !away) return null;

  const homeEdge = (home.rating - away.rating) / 36
    + (home.xgFor - away.xgAgainst) / 7
    + (home.form - away.form) / 3
    + 0.08;
  const awayEdge = (away.rating - home.rating) / 36
    + (away.xgFor - home.xgAgainst) / 7
    + (away.form - home.form) / 3;

  let homeProb = clamp(0.38 + homeEdge, 0.12, 0.78);
  let awayProb = clamp(0.32 + awayEdge, 0.10, 0.74);
  let drawProb = clamp(1 - homeProb - awayProb, 0.16, 0.34);

  const total = homeProb + awayProb + drawProb;
  homeProb /= total;
  awayProb /= total;
  drawProb /= total;

  const probs = { home: homeProb, draw: drawProb, away: awayProb };
  return Object.fromEntries(outcomes.map((outcome) => [outcome.id, probs[outcome.id]]).filter(([, value]) => value));
};

export const recommendMarketBets = (match, market, options = {}) => {
  if (!market?.outcomes?.length) return [];

  const baseline = marketBaseline(market.outcomes);
  const statsModel = market.type === "1x2"
    ? teamStrengthModel(match, market.outcomes, options.teamStats)
    : null;

  return market.outcomes.map((outcome) => {
    const best = bestOddsForOutcome(outcome);
    const marketProb = baseline[outcome.id] || 0;
    const modelProb = statsModel?.[outcome.id]
      ? (marketProb * 0.55 + statsModel[outcome.id] * 0.45)
      : marketProb;
    const ev = expectedValue(modelProb, best.decimalOdds);
    const kelly = kellyStakeFraction(modelProb, best.decimalOdds, options.kellyFraction ?? 0.25);

    return {
      matchId: match.id,
      matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
      marketId: market.id,
      marketLabel: market.label,
      outcomeId: outcome.id,
      outcomeLabel: outcome.label,
      bookmaker: best.bookmakerName || best.bookmaker,
      odds: best.decimalOdds,
      marketProbability: round4(marketProb),
      modelProbability: round4(modelProb),
      ev,
      kelly,
      confidence: statsModel ? 0.64 : 0.48,
      recommendation: ev >= 0.06 && kelly > 0 ? "BET" : ev >= 0.02 ? "WATCH" : "PASS",
      reason: statsModel
        ? "Markedet er de-vigget og vektet mot lagstyrke, form og xG-profil."
        : "Basert på de-vigget beste marked. Trenger historiske lagdata for sterkere signal.",
    };
  }).sort((a, b) => b.ev - a.ev);
};

export const recommendMatches = (matches, options = {}) => matches
  .flatMap((match) => match.markets.flatMap((market) => recommendMarketBets(match, market, options)))
  .filter((bet) => bet.recommendation !== "PASS")
  .sort((a, b) => b.ev - a.ev);
