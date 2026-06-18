const sameGamePenalty = (a, b) => a.matchId === b.matchId ? 0.22 : 0;
const sameTeamPenalty = (a, b) => a.teamId && a.teamId === b.teamId ? 0.14 : 0;
const sameMarketPenalty = (a, b) => a.marketType === b.marketType && a.matchId === b.matchId ? 0.18 : 0;
const sameGroupPenalty = (a, b) => a.correlationGroup === b.correlationGroup ? 0.3 : 0;

export const pairCorrelationRisk = (a, b) => Math.min(1,
  sameGamePenalty(a, b)
  + sameTeamPenalty(a, b)
  + sameMarketPenalty(a, b)
  + sameGroupPenalty(a, b)
);

export const calculateCorrelationRisk = (legs) => {
  if (legs.length < 2) return 0;
  let total = 0;
  let pairs = 0;

  for (let i = 0; i < legs.length; i += 1) {
    for (let j = i + 1; j < legs.length; j += 1) {
      total += pairCorrelationRisk(legs[i], legs[j]);
      pairs += 1;
    }
  }

  return pairs ? total / pairs : 0;
};

export const canAddLeg = (legs, candidate, {
  excludeSameGame = false,
  maxLegsPerMatch = 1,
  maxCorrelationRisk = 0.45,
} = {}) => {
  const sameMatchCount = legs.filter((leg) => leg.matchId === candidate.matchId).length;
  if (excludeSameGame && sameMatchCount > 0) return false;
  if (sameMatchCount >= maxLegsPerMatch) return false;

  const projectedRisk = calculateCorrelationRisk([...legs, candidate]);
  return projectedRisk <= maxCorrelationRisk;
};
