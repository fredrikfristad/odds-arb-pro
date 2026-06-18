import { buildHistoricalDataset } from "./historicalData.js";
import { buildCandidateBets } from "./valueEngine.js";
import { canAddLeg } from "./correlationEngine.js";
import { scoreParlay } from "./scoringEngine.js";
import { simulateParlay } from "./simulationEngine.js";

const PARLAY_TYPES = {
  safe: { label: "Safe Parlay", maxOdds: 5, preferRisk: "Low", valueOnly: true },
  balanced: { label: "Balanced Parlay", maxOdds: 12, preferRisk: "Medium", valueOnly: true },
  highRisk: { label: "High Risk Parlay", maxOdds: 80, preferRisk: "High", valueOnly: false },
  playerProps: { label: "Player Props Parlay", marketTypes: ["player_prop"], valueOnly: true },
  sameGame: { label: "Same Game Parlay", allowSameGame: true, maxLegsPerMatch: 4, valueOnly: true },
  aiValue: { label: "AI Value Parlay", valueOnly: true },
  worldCup: { label: "VM 2026 Parlay", worldCupOnly: true, valueOnly: true },
};

const defaultOptions = {
  parlayType: "aiValue",
  legCount: 3,
  minTotalOdds: 2,
  maxTotalOdds: 12,
  targetTotalOdds: 6,
  riskLevel: "Medium",
  worldCupOnly: false,
  valueOnly: true,
  excludeSameGame: true,
  maxLegsPerMatch: 1,
  maxCorrelationRisk: 0.35,
  seedOffset: 0,
};

const totalOdds = (legs) => legs.reduce((acc, leg) => acc * leg.odds, 1);

const riskConfig = (riskLevel) => {
  if (riskLevel === "High") {
    return {
      valueWeight: 0.28,
      probabilityWeight: 0.12,
      oddsTargetWeight: 0.56,
      uncertaintyPenalty: 0.04,
      maxLegOdds: Infinity,
    };
  }
  if (riskLevel === "Low") {
    return {
      valueWeight: 0.32,
      probabilityWeight: 0.42,
      oddsTargetWeight: 0.18,
      uncertaintyPenalty: 0.08,
      maxLegOdds: 2.4,
    };
  }
  return {
    valueWeight: 0.34,
    probabilityWeight: 0.28,
    oddsTargetWeight: 0.3,
    uncertaintyPenalty: 0.08,
    maxLegOdds: 5.5,
  };
};

const candidateScore = (candidate, currentOdds, remainingLegs, options) => {
  const profile = riskConfig(options.riskLevel);
  if (candidate.odds > profile.maxLegOdds && options.targetTotalOdds <= 20) return -Infinity;

  const desiredLegOdds = Math.max(1.01, (options.targetTotalOdds / Math.max(currentOdds, 1)) ** (1 / Math.max(remainingLegs, 1)));
  const oddsDistance = Math.abs(Math.log(candidate.odds) - Math.log(desiredLegOdds));
  const oddsTargetScore = Math.max(0, 1 - oddsDistance);
  const valueScore = Math.max(-0.25, candidate.expectedValue) + Math.max(0, candidate.edge);
  const probabilityScore = candidate.modelProbability;

  return (valueScore * profile.valueWeight)
    + (probabilityScore * profile.probabilityWeight)
    + (oddsTargetScore * profile.oddsTargetWeight)
    - (candidate.modelUncertainty * profile.uncertaintyPenalty);
};

const explainParlay = (parlay) => {
  const valueLegs = parlay.legs.filter((leg) => leg.expectedValue > 0).length;
  return [
    parlay.relaxed ? "Viser nærmeste forslag fordi de strenge filtrene ikke ga en perfekt match." : "",
    `${valueLegs}/${parlay.legs.length} legs har positiv modellert EV.`,
    parlay.options.targetTotalOdds ? `Generatoren forsøkte å treffe rundt ${parlay.options.targetTotalOdds.toFixed(2)} i totalodds.` : "",
    `Estimert treffrate er ${(parlay.score.hitProbability * 100).toFixed(1)}%.`,
    `Korrelasjonsrisiko er ${(parlay.score.correlationRisk * 100).toFixed(1)}%, som klassifiseres som ${parlay.score.riskLabel}.`,
    parlay.legs.some((leg) => leg.isWorldCup2026)
      ? "VM 2026-modus bruker landslags-/Elo/FIFA-signaler og nøytral-bane-logikk i placeholder-modellen."
      : "Modellen bruker live odds og historisk kontekst-placeholder frem til ekte statistikkfeed kobles på.",
  ].filter(Boolean).join(" ");
};

const buildGreedyParlay = (candidates, options, typeConfig, offset = 0) => {
  const legs = [];
  const rotated = candidates.length ? [...candidates.slice(offset), ...candidates.slice(0, offset)] : [];

  while (legs.length < options.legCount) {
    const currentOdds = totalOdds(legs);
    const remainingLegs = options.legCount - legs.length;
    const ranked = rotated
      .filter((candidate) => !legs.some((leg) => leg.id === candidate.id))
      .filter((candidate) => canAddLeg(legs, candidate, {
        excludeSameGame: options.excludeSameGame && !typeConfig.allowSameGame,
        maxLegsPerMatch: options.maxLegsPerMatch,
        maxCorrelationRisk: options.maxCorrelationRisk,
      }))
      .map((candidate) => ({
        candidate,
        score: candidateScore(candidate, currentOdds, remainingLegs, options),
      }))
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score);

    if (!ranked.length) break;
    legs.push(ranked[0].candidate);
  }

  return legs;
};

export const generateParlays = (matches, userOptions = {}) => {
  const typeConfig = PARLAY_TYPES[userOptions.parlayType] || PARLAY_TYPES.aiValue;
  const options = {
    ...defaultOptions,
    ...typeConfig,
    ...userOptions,
    worldCupOnly: userOptions.worldCupOnly || typeConfig.worldCupOnly || false,
    valueOnly: userOptions.valueOnly ?? typeConfig.valueOnly ?? true,
    maxLegsPerMatch: userOptions.maxLegsPerMatch ?? typeConfig.maxLegsPerMatch ?? defaultOptions.maxLegsPerMatch,
  };

  options.targetTotalOdds = Math.max(1, Number(options.targetTotalOdds || options.maxTotalOdds || defaultOptions.targetTotalOdds));
  options.maxTotalOdds = Math.max(options.maxTotalOdds, options.targetTotalOdds);
  options.minTotalOdds = Math.min(options.minTotalOdds, options.targetTotalOdds);

  const historicalDataset = buildHistoricalDataset(matches);
  const allCandidates = buildCandidateBets(matches, historicalDataset).filter((bet) => {
    if (options.worldCupOnly && !bet.isWorldCup2026) return false;
    if (typeConfig.marketTypes && !typeConfig.marketTypes.includes(bet.marketType)) return false;
    return true;
  });
  let candidates = allCandidates.filter((bet) => !options.valueOnly || bet.isPositiveEV);
  if (candidates.length < options.legCount && options.valueOnly) {
    candidates = allCandidates;
  }

  const parlays = [];
  const offset = candidates.length ? options.seedOffset % candidates.length : 0;
  const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
  const seeds = [
    rotated,
    [...candidates].sort((a, b) => b.modelProbability - a.modelProbability),
    [...candidates].sort((a, b) => (b.edge + b.modelProbability) - (a.edge + a.modelProbability)),
    [...candidates].sort((a, b) => b.odds - a.odds),
    [...candidates].sort((a, b) => Math.abs(a.odds - (options.targetTotalOdds ** (1 / options.legCount))) - Math.abs(b.odds - (options.targetTotalOdds ** (1 / options.legCount)))),
  ];

  const attempts = [
    ...seeds.map((list) => buildGreedyParlay(list, options, typeConfig, 0)),
    ...Array.from({ length: Math.min(24, candidates.length) }, (_, index) => buildGreedyParlay(candidates, options, typeConfig, (offset + index) % Math.max(candidates.length, 1))),
  ];

  const makeParlay = (legs, relaxed = false) => {
    const score = scoreParlay(legs);
    const simulation = simulateParlay(legs);
    const parlay = {
      id: `${options.parlayType}-${relaxed ? "relaxed" : "strict"}-${parlays.length}-${legs.map((leg) => leg.id).join("|")}`,
      type: typeConfig.label,
      options,
      legs,
      score,
      simulation,
      relaxed,
      explanation: "",
    };
    parlay.explanation = explainParlay(parlay);
    return parlay;
  };

  const duplicate = (legs) => parlays.some((parlay) => (
    parlay.legs.map((leg) => leg.id).sort().join("|") === legs.map((leg) => leg.id).sort().join("|")
  ));

  for (const legs of attempts) {
    if (legs.length !== options.legCount) continue;
    const odds = totalOdds(legs);
    if (odds < options.minTotalOdds || odds > options.maxTotalOdds) continue;
    if (duplicate(legs)) continue;
    parlays.push(makeParlay(legs));
  }

  if (!parlays.length) {
    const fallbackAttempts = attempts
      .filter((legs) => legs.length === options.legCount)
      .sort((a, b) => (
        Math.abs(Math.log(totalOdds(a)) - Math.log(options.targetTotalOdds))
        - Math.abs(Math.log(totalOdds(b)) - Math.log(options.targetTotalOdds))
      ));

    for (const legs of fallbackAttempts) {
      if (duplicate(legs)) continue;
      parlays.push(makeParlay(legs, true));
      if (parlays.length >= 5) break;
    }
  }

  return parlays.sort((a, b) => {
    const aDistance = Math.abs(Math.log(a.score.totalOdds) - Math.log(options.targetTotalOdds));
    const bDistance = Math.abs(Math.log(b.score.totalOdds) - Math.log(options.targetTotalOdds));
    return (b.score.parlayScore - (bDistance * 18)) - (a.score.parlayScore - (aDistance * 18));
  });
};

export const PARLAY_TYPE_OPTIONS = Object.entries(PARLAY_TYPES).map(([id, config]) => ({
  id,
  label: config.label,
}));
