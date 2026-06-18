import { bookmakerUrl } from "../config/bookmakers.js";
import { buildHistoricalContext, isWorldCupMatch } from "./historicalData.js";
import { predictBetProbability } from "./modelLayer.js";
import { isNorskTippingBookmaker, norskTippingUrl } from "./norskTippingAdapter.js";

const round4 = (value) => Math.round(value * 10000) / 10000;

export const impliedProbability = (odds) => 1 / odds;
export const expectedValue = (probability, odds) => round4((probability * odds) - 1);

const correlationGroupFor = (match, market, outcome) => [
  match.id,
  market.type,
  outcome.id.includes("over") ? "goals-upside" : outcome.id.includes("under") ? "goals-downside" : outcome.id,
].join(":");

export const SUPPORTED_PARLAY_MARKETS = [
  "1x2",
  "double_chance",
  "over_under",
  "btts",
  "correct_score",
  "asian_handicap",
  "spread",
  "player_scorer",
  "shots_on_target",
  "cards",
  "corners",
  "first_goalscorer",
  "team_total_goals",
  "clean_sheet",
  "win_totals",
  "win_btts",
];

export const PLAYER_PROP_MARKETS = new Set(["player_scorer", "shots_on_target", "first_goalscorer"]);
export const WEAK_DATA_MARKETS = new Set(["correct_score", "player_scorer", "shots_on_target", "first_goalscorer"]);

const MARKET_REASON = {
  "1x2": "Valgt fra kampresultat basert på form, Elo/FIFA-signal, xG-differanse og bookmakerens implied probability.",
  double_chance: "Dobbelsjanse vurderes med lavere risiko fordi to utfall dekker bettet.",
  over_under: "Over/under vurderes med målform, xG/xGA, BTTS-rate og historisk over-rate.",
  btts: "BTTS vurderes med begge lags scoringstakt, xG og clean sheet-rate.",
  asian_handicap: "Handicap vurderes med styrkeforskjell, form og forventet måldifferanse.",
  spread: "Handicap vurderes med styrkeforskjell, form og forventet måldifferanse.",
  cards: "Kort vurderes med kort-rate og kampintensitet der data finnes.",
  corners: "Cornere vurderes med corner-rate og angrepstrykk der data finnes.",
  team_total_goals: "Lag totalt mål vurderes med lagets målform, xG og motstanders xGA.",
  clean_sheet: "Clean sheet vurderes med defensiv form, xGA og motstanders scoringstakt.",
  win_totals: "Kombimarked vurderes med seier-sannsynlighet kombinert med målmodell.",
  win_btts: "Kombimarked vurderes med seier-sannsynlighet kombinert med BTTS-signal.",
};

const EXCLUDED_STATUSES = new Set([
  "completed",
  "finished",
  "final",
  "ended",
  "cancelled",
  "canceled",
  "postponed",
  "live",
]);

export const isUpcomingPlayableMatch = (match, now = Date.now()) => {
  const status = String(match.status || "").toLowerCase();
  if (EXCLUDED_STATUSES.has(status)) return false;
  if (!match.startsAt) return status === "upcoming";

  const startsAt = new Date(match.startsAt).getTime();
  if (!Number.isFinite(startsAt)) return false;
  return startsAt > now;
};

const bestOddForOutcome = (outcome, options) => {
  const odds = (outcome.odds || []).filter((odd) => Number.isFinite(odd?.decimalOdds) && odd.decimalOdds > 1);
  const scoped = options.norskTippingOnly ? odds.filter(isNorskTippingBookmaker) : odds;
  if (!scoped.length) return null;
  return scoped.reduce((best, odd) => odd.decimalOdds > best.decimalOdds ? odd : best, scoped[0]);
};

const reasonForBet = (market, bet, context) => {
  const base = MARKET_REASON[market.type] || "Valgt fordi modellen fant positiv forventet verdi mot bookmakerens pris.";
  const dataNote = context.dataQuality.hasRealHistoricalStats
    ? "Bruker ekte historiske statistikkfelter der de finnes."
    : "Ekte dybdestatistikk mangler foreløpig, så confidence/datastøtte holdes lavere.";
  return `${base} Modell ${(bet.modelProbability * 100).toFixed(1)}% vs bookmaker ${(bet.impliedProbability * 100).toFixed(1)}%, EV ${(bet.expectedValue * 100).toFixed(1)}%. ${dataNote}`;
};

export const buildCandidateBets = (matches, historicalDataset = {}, options = {}) => {
  const bets = [];
  const allowedMarketTypes = options.allowedMarketTypes?.length ? new Set(options.allowedMarketTypes) : null;
  const includePlayerProps = Boolean(options.includePlayerProps);

  for (const match of matches || []) {
    if (!isUpcomingPlayableMatch(match)) continue;

    const context = historicalDataset[match.id] || buildHistoricalContext(match);
    for (const market of match.markets || []) {
      if (!SUPPORTED_PARLAY_MARKETS.includes(market.type)) continue;
      if (allowedMarketTypes && !allowedMarketTypes.has(market.type)) continue;
      if (options.exclude1x2 && market.type === "1x2") continue;
      if (!includePlayerProps && PLAYER_PROP_MARKETS.has(market.type)) continue;
      if (WEAK_DATA_MARKETS.has(market.type) && !context.dataQuality.hasRealHistoricalStats) continue;

      for (const outcome of market.outcomes || []) {
        if (!outcome.odds?.length) continue;
        const best = bestOddForOutcome(outcome, options);
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
          matchStatus: match.status,
          bookmaker: best.bookmakerName || best.bookmaker,
          bookmakerKey: best.bookmaker,
          bookmakerUrl: isNorskTippingBookmaker(best)
            ? norskTippingUrl(best.bookmakerUrl)
            : bookmakerUrl(best.bookmaker, best.bookmakerUrl),
          isNorskTipping: isNorskTippingBookmaker(best),
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

        const bet = {
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
          statisticalSupport: context.dataQuality.hasRealHistoricalStats ? "High" : WEAK_DATA_MARKETS.has(market.type) ? "Low" : "Medium",
        };

        bets.push({
          ...bet,
          reason: reasonForBet(market, bet, context),
        });
      }
    }
  }

  return bets.sort((a, b) => b.expectedValue - a.expectedValue);
};
