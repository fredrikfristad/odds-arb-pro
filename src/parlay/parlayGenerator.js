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
  riskLevel: "Medium",
  worldCupOnly: false,
  valueOnly: true,
  excludeSameGame: true,
  maxLegsPerMatch: 1,
  maxCorrelationRisk: 0.35,
  seedOffset: 0,
};

const totalOdds = (legs) => legs.reduce((acc, leg) => acc * leg.odds, 1);

const explainParlay = (parlay) => {
  const valueLegs = parlay.legs.filter((leg) => leg.expectedValue > 0).length;
  return [
    `${valueLegs}/${parlay.legs.length} legs har positiv modellert EV.`,
    `Estimert treffrate er ${(parlay.score.hitProbability * 100).toFixed(1)}%.`,
    `Korrelasjonsrisiko er ${(parlay.score.correlationRisk * 100).toFixed(1)}%, som klassifiseres som ${parlay.score.riskLabel}.`,
    parlay.legs.some((leg) => leg.isWorldCup2026)
      ? "VM 2026-modus bruker landslags-/Elo/FIFA-signaler og nøytral-bane-logikk i placeholder-modellen."
      : "Modellen bruker live odds og historisk kontekst-placeholder frem til ekte statistikkfeed kobles på.",
  ].join(" ");
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

  const historicalDataset = buildHistoricalDataset(matches);
  let candidates = buildCandidateBets(matches, historicalDataset);
  candidates = candidates.filter((bet) => {
    if (options.worldCupOnly && !bet.isWorldCup2026) return false;
    if (options.valueOnly && !bet.isPositiveEV) return false;
    if (typeConfig.marketTypes && !typeConfig.marketTypes.includes(bet.marketType)) return false;
    return true;
  });

  const parlays = [];
  const offset = candidates.length ? options.seedOffset % candidates.length : 0;
  const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
  const seeds = [
    rotated,
    [...candidates].sort((a, b) => b.modelProbability - a.modelProbability),
    [...candidates].sort((a, b) => (b.edge + b.modelProbability) - (a.edge + a.modelProbability)),
  ];

  for (const list of seeds) {
    const legs = [];
    for (const candidate of list) {
      if (legs.length >= options.legCount) break;
      if (!canAddLeg(legs, candidate, {
        excludeSameGame: options.excludeSameGame && !typeConfig.allowSameGame,
        maxLegsPerMatch: options.maxLegsPerMatch,
        maxCorrelationRisk: options.maxCorrelationRisk,
      })) continue;
      legs.push(candidate);
    }

    if (legs.length !== options.legCount) continue;
    const odds = totalOdds(legs);
    if (odds < options.minTotalOdds || odds > options.maxTotalOdds) continue;

    const score = scoreParlay(legs);
    const simulation = simulateParlay(legs);
    const parlay = {
      id: `${options.parlayType}-${parlays.length}-${legs.map((leg) => leg.id).join("|")}`,
      type: typeConfig.label,
      options,
      legs,
      score,
      simulation,
      explanation: "",
    };
    parlay.explanation = explainParlay(parlay);
    parlays.push(parlay);
  }

  return parlays.sort((a, b) => b.score.parlayScore - a.score.parlayScore);
};

export const PARLAY_TYPE_OPTIONS = Object.entries(PARLAY_TYPES).map(([id, config]) => ({
  id,
  label: config.label,
}));
