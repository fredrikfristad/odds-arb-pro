const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round4 = (value) => Math.round(value * 10000) / 10000;

const hash = (value) => [...String(value)].reduce((sum, char) => sum + char.charCodeAt(0), 0);

const isWorldCup = (match) => {
  const text = `${match?.tournament || ""} ${match?.round || ""} ${match?.group || ""}`.toLowerCase();
  return text.includes("world cup") || text.includes("vm 2026") || text.includes("fifa");
};

export const buildProbabilityContext = (match) => {
  const seed = hash(`${match?.homeTeam}-${match?.awayTeam}-${match?.startsAt}`);
  const worldCup = isWorldCup(match);
  const sampleSize = 12 + (seed % 9);
  const freshnessDays = 2 + (seed % 12);
  const stability = 0.54 + ((seed % 31) / 100);

  return {
    matchId: match.id,
    source: "odds-derived-placeholder-context",
    hasRealStats: false,
    isWorldCup2026: worldCup,
    sampleSize,
    freshnessDays,
    stability,
    home: {
      form5: 0.42 + ((seed % 35) / 100),
      form10: 0.44 + (((seed + 7) % 32) / 100),
      form20: 0.46 + (((seed + 13) % 28) / 100),
      xG: 0.9 + ((seed % 60) / 45),
      xGA: 0.8 + (((seed + 11) % 55) / 50),
      goalsFor: 0.8 + (((seed + 17) % 65) / 45),
      goalsAgainst: 0.7 + (((seed + 19) % 50) / 45),
      shotsOnTarget: 3 + (seed % 5),
      cleanSheetRate: 0.18 + ((seed % 24) / 100),
      bttsRate: 0.42 + ((seed % 22) / 100),
      overRate: 0.44 + (((seed + 5) % 24) / 100),
      cornerRate: 4 + (seed % 5),
      cardRate: 1 + (seed % 4),
      elo: 1450 + (seed % 420),
      playerForm: 0.48 + ((seed % 30) / 100),
      injuriesImpact: (seed % 16) / 100,
    },
    away: {
      form5: 0.41 + (((seed + 23) % 35) / 100),
      form10: 0.43 + (((seed + 29) % 32) / 100),
      form20: 0.45 + (((seed + 31) % 28) / 100),
      xG: 0.85 + (((seed + 37) % 60) / 45),
      xGA: 0.82 + (((seed + 41) % 55) / 50),
      goalsFor: 0.78 + (((seed + 43) % 65) / 45),
      goalsAgainst: 0.72 + (((seed + 47) % 50) / 45),
      shotsOnTarget: 3 + ((seed + 2) % 5),
      cleanSheetRate: 0.17 + (((seed + 3) % 24) / 100),
      bttsRate: 0.41 + (((seed + 5) % 22) / 100),
      overRate: 0.43 + (((seed + 7) % 24) / 100),
      cornerRate: 4 + ((seed + 3) % 5),
      cardRate: 1 + ((seed + 1) % 4),
      elo: 1430 + (((seed + 97) % 420)),
      playerForm: 0.46 + (((seed + 11) % 30) / 100),
      injuriesImpact: ((seed + 5) % 16) / 100,
    },
    dataQuality: {
      sampleSizeScore: clamp(sampleSize / 20, 0.35, 1),
      freshnessScore: clamp(1 - (freshnessDays / 30), 0.35, 1),
      stabilityScore: stability,
      realStatsScore: 0.35,
      sourceCount: 1,
    },
  };
};

const marketProbability = (outcome, market, context) => {
  const id = String(outcome.id || "").toLowerCase();
  const label = String(outcome.label || "").toLowerCase();
  const home = context.home;
  const away = context.away;

  if (market.type === "1x2") {
    const eloDiff = (home.elo - away.elo) / 800;
    const formDiff = ((home.form5 * 0.5 + home.form10 * 0.3 + home.form20 * 0.2) - (away.form5 * 0.5 + away.form10 * 0.3 + away.form20 * 0.2));
    const xgDiff = ((home.xG - home.xGA) - (away.xG - away.xGA)) / 5;
    const homeWin = clamp(0.38 + eloDiff + formDiff * 0.28 + xgDiff - home.injuriesImpact * 0.08 + away.injuriesImpact * 0.08, 0.08, 0.78);
    const awayWin = clamp(0.31 - eloDiff + (away.form5 - home.form5) * 0.24 - xgDiff + home.injuriesImpact * 0.08 - away.injuriesImpact * 0.08, 0.08, 0.72);
    const draw = clamp(1 - homeWin - awayWin, 0.14, 0.36);
    const total = homeWin + draw + awayWin;
    if (id === "home") return homeWin / total;
    if (id === "away") return awayWin / total;
    if (id === "draw") return draw / total;
  }

  if (market.type === "over_under") {
    const totalXg = home.xG + away.xG;
    const btts = (home.bttsRate + away.bttsRate) / 2;
    const overProb = clamp(0.44 + ((totalXg - 2.35) * 0.13) + ((btts - 0.5) * 0.18), 0.18, 0.82);
    if (id.includes("over") || label.includes("over")) return overProb;
    if (id.includes("under") || label.includes("under")) return 1 - overProb;
  }

  if (market.type === "btts") {
    const probability = clamp((home.bttsRate + away.bttsRate) / 2 + ((home.xG + away.xG - 2.4) * 0.05), 0.18, 0.82);
    if (id.includes("yes") || label.includes("yes") || label.includes("ja")) return probability;
    if (id.includes("no") || label.includes("no") || label.includes("nei")) return 1 - probability;
  }

  const bestOdds = Math.max(...(outcome.odds || []).map((odd) => odd.decimalOdds || 0), 1.01);
  return clamp(1 / bestOdds, 0.03, 0.92);
};

export const estimateOutcomeProbability = (match, market, outcome, context = buildProbabilityContext(match)) => {
  const modelProbability = round4(clamp(marketProbability(outcome, market, context), 0.03, 0.92));
  const quality = context.dataQuality;
  const dataQualityScore = round4(clamp(
    (quality.sampleSizeScore * 0.28)
      + (quality.freshnessScore * 0.22)
      + (quality.stabilityScore * 0.25)
      + (quality.realStatsScore * 0.25),
    0,
    1,
  ));
  const confidence = round4(clamp((dataQualityScore * 0.74) + ((1 - Math.abs(modelProbability - 0.5)) * 0.26), 0.05, 0.98));

  return {
    probability: modelProbability,
    confidence,
    confidenceLabel: confidence >= 0.72 ? "High" : confidence >= 0.52 ? "Medium" : "Low",
    dataQualityScore,
    dataQualityLabel: dataQualityScore >= 0.72 ? "High" : dataQualityScore >= 0.5 ? "Medium" : "Low",
    context,
  };
};
