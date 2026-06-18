import { calculateCorrelationRisk } from "./correlationEngine.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const product = (values) => values.reduce((acc, value) => acc * value, 1);

export const scoreParlay = (legs) => {
  const totalOdds = product(legs.map((leg) => leg.odds));
  const hitProbability = product(legs.map((leg) => leg.modelProbability));
  const expectedReturn = hitProbability * totalOdds;
  const expectedValue = expectedReturn - 1;
  const avgUncertainty = legs.reduce((sum, leg) => sum + leg.modelUncertainty, 0) / legs.length;
  const stability = legs.reduce((sum, leg) => sum + leg.historicalStability, 0) / legs.length;
  const correlationRisk = calculateCorrelationRisk(legs);

  const expectedValueScore = clamp(expectedValue * 38, -20, 35);
  const hitProbabilityScore = clamp(hitProbability * 55, 0, 30);
  const oddsValueScore = clamp(Math.log(Math.max(totalOdds, 1)) * 8, 0, 22);
  const correlationPenalty = correlationRisk * 34;
  const uncertaintyPenalty = avgUncertainty * 42;
  const stabilityBonus = stability * 12;
  const parlayScore = clamp(
    expectedValueScore + hitProbabilityScore + oddsValueScore + stabilityBonus - correlationPenalty - uncertaintyPenalty,
    0,
    100,
  );

  return {
    totalOdds,
    hitProbability,
    expectedValue,
    expectedReturn,
    correlationRisk,
    avgUncertainty,
    historicalStability: stability,
    parlayScore,
    riskLabel: correlationRisk > 0.35 || totalOdds > 15 ? "High" : correlationRisk > 0.18 || totalOdds > 6 ? "Medium" : "Low",
  };
};
