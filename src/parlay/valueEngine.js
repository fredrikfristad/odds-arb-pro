import { bestOddsForOutcome } from "../engine/recommendations.js";
import { bookmakerUrl } from "../config/bookmakers.js";
import { buildHistoricalContext, isWorldCupMatch } from "./historicalData.js";
import { predictBetProbability } from "./modelLayer.js";

const round4 = (value) => Math.round(value * 10000) / 10000;

export const impliedProbability = (odds) => 1 / odds;
export const expectedValue = (probability, odds) => round4((probability * odds) - 1);

const correlationGroupFor = (match, market, outcome) => [
  match.id,
  market.type,
  outcome.id.includes("over") ? "goals-upside" : outcome.id.includes("under") ? "goals-downside" : outcome.id,
].join(":");

export const buildCandidateBets = (matches, historicalDataset = {}) => {
  const bets = [];

  for (const match of matches || []) {
    const context = historicalDataset[match.id] || buildHistoricalContext(match);
    for (const market of match.markets || []) {
      for (const outcome of market.outcomes || []) {
        if (!outcome.odds?.length) continue;
        const best = bestOddsForOutcome(outcome);
        if (!Number.isFinite(best?.decimalOdds) || best.decimalOdds <= 1) continue;

        const baseBet = {
          id: `${match.id}-${market.id}-${outcome.id}`,
          matchId: match.id,
          teamId: outcome.id === "home" ? match.homeTeam : outcome.id === "away" ? match.awayTeam : null,
          playerId: null,
          competitionId: context.competitionId,
          isWorldCup2026: isWorldCupMatch(match),
          matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
          matchDate: match.startsAt,
          bookmaker: best.bookmakerName || best.bookmaker,
          bookmakerKey: best.bookmaker,
          bookmakerUrl: bookmakerUrl(best.bookmaker, best.bookmakerUrl),
          marketId: market.id,
          marketType: market.type,
          marketLabel: market.label,
          outcomeId: outcome.id,
          outcomeLabel: outcome.label,
          odds: best.decimalOdds,
          fetchedAt: best.fetchedAt,
          correlationGroup: correlationGroupFor(match, market, outcome),
          dataContext: context,
        };

        const prediction = predictBetProbability(baseBet, context);
        const implied = impliedProbability(baseBet.odds);
        const edge = prediction.modelProbability - implied;
        const ev = expectedValue(prediction.modelProbability, baseBet.odds);

        bets.push({
          ...baseBet,
          modelProbability: round4(prediction.modelProbability),
          impliedProbability: round4(implied),
          edge: round4(edge),
          expectedValue: ev,
          modelUncertainty: round4(prediction.modelUncertainty),
          isPositiveEV: ev > 0,
          historicalStability: context.dataQuality.hasRealHistoricalStats
            ? 0.78
            : 0.48,
          modelNames: prediction.modelNames,
        });
      }
    }
  }

  return bets.sort((a, b) => b.expectedValue - a.expectedValue);
};
