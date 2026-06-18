import { bestOddsForOutcome, findArbitrage } from "./recommendations.js";
import { estimateOutcomeProbability, buildProbabilityContext } from "./probabilityModel.js";
import {
  classifyValue,
  expectedValuePct,
  fairOddsFromProbability,
  impliedProbabilityFromOdds,
  valueEdgePct,
} from "./fairOddsCalculator.js";

const round2 = (value) => Math.round(value * 100) / 100;

const validOdd = (odd) => Number.isFinite(odd?.decimalOdds) && odd.decimalOdds > 1;

const reasonFor = ({ match, market, outcome, probability, bestOdd, context }) => {
  const side = outcome.id === "home" ? context.home : outcome.id === "away" ? context.away : null;
  const opponent = outcome.id === "home" ? context.away : outcome.id === "away" ? context.home : null;

  if (market.type === "1x2" && side && opponent) {
    return `${outcome.label} vurderes ut fra form siste 5/10/20, xG-differanse, Elo/FIFA-signal og skadepåvirkning. Modellen estimerer ${(probability * 100).toFixed(1)}% sannsynlighet, mens ${bestOdd.bookmakerName || bestOdd.bookmaker} priser utfallet til ${((1 / bestOdd.decimalOdds) * 100).toFixed(1)}%. Datagrunnlaget er ${context.dataQuality.source}.`;
  }

  if (market.type === "over_under") {
    const totalXg = context.home.xG + context.away.xG;
    return `Over/under-signalet bruker estimert total xG (${totalXg.toFixed(2)}), BTTS-rate og målform. Modellen gir ${(probability * 100).toFixed(1)}%, mens bookmakeren priser dette til ${((1 / bestOdd.decimalOdds) * 100).toFixed(1)}%.`;
  }

  return `Modellen kombinerer tilgjengelig form, historikk-placeholder, VM-markering og oddsbevegelsesklare felter. Estimert sannsynlighet er ${(probability * 100).toFixed(1)}% mot bookmakerens ${((1 / bestOdd.decimalOdds) * 100).toFixed(1)}%.`;
};

export const calculateValueBets = (matches, {
  minValueEdge = -100,
  minConfidence = 0,
  bookmaker = "all",
  marketType = "all",
  includeOverpriced = true,
} = {}) => {
  const results = [];

  for (const match of matches || []) {
    const context = buildProbabilityContext(match);
    for (const market of match.markets || []) {
      if (marketType !== "all" && market.type !== marketType) continue;
      const arbitrage = findArbitrage(market);

      for (const outcome of market.outcomes || []) {
        const validOdds = (outcome.odds || []).filter(validOdd);
        if (!validOdds.length) continue;
        const best = bestOddsForOutcome({ ...outcome, odds: validOdds });
        if (bookmaker !== "all" && (best.bookmakerName || best.bookmaker) !== bookmaker) continue;

        const prediction = estimateOutcomeProbability(match, market, outcome, context);
        const fairOdds = fairOddsFromProbability(prediction.probability);
        const impliedProbability = impliedProbabilityFromOdds(best.decimalOdds);
        const edge = valueEdgePct(best.decimalOdds, fairOdds);
        const ev = expectedValuePct(prediction.probability, best.decimalOdds);
        const tag = classifyValue({ valueEdge: edge, isArbitrage: Boolean(arbitrage?.isArb) });

        if (!includeOverpriced && edge < 0) continue;
        if (edge < minValueEdge) continue;
        if (prediction.confidence < minConfidence) continue;

        const rankScore = round2(
          (edge * 0.52)
            + (prediction.confidence * 100 * 0.28)
            + (prediction.dataQualityScore * 100 * 0.2),
        );

        results.push({
          id: `${match.id}-${market.id}-${outcome.id}-${best.bookmaker}`,
          matchId: match.id,
          match,
          matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
          startsAt: match.startsAt,
          status: match.status,
          tournament: match.tournament,
          marketId: market.id,
          marketType: market.type,
          marketLabel: market.label,
          outcomeId: outcome.id,
          outcomeLabel: outcome.label,
          bookmaker: best.bookmakerName || best.bookmaker,
          bookmakerKey: best.bookmaker,
          bookmakerUrl: best.bookmakerUrl,
          bookmakerOdds: best.decimalOdds,
          fairOdds,
          impliedProbability,
          modelProbability: prediction.probability,
          valueEdge: edge,
          expectedValue: ev,
          confidence: prediction.confidence,
          confidenceLabel: prediction.confidenceLabel,
          dataQualityScore: prediction.dataQualityScore,
          dataQualityLabel: prediction.dataQualityLabel,
          rankScore,
          tag,
          isArbitrage: Boolean(arbitrage?.isArb),
          fetchedAt: best.fetchedAt,
          reason: reasonFor({ match, market, outcome, probability: prediction.probability, bestOdd: best, context }),
        });
      }
    }
  }

  return results.sort((a, b) => b.rankScore - a.rankScore);
};
