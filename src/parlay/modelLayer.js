const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const sigmoid = (value) => 1 / (1 + Math.exp(-value));

const marketBaselineProbability = (bet) => 1 / bet.odds;

const teamSignal = (context, bet) => {
  if (!context) return 0;
  const home = context.homeTeam;
  const away = context.awayTeam;
  const side = bet.outcomeId === "home" ? 1 : bet.outcomeId === "away" ? -1 : 0;
  const eloDiff = ((home.eloRating || 1500) - (away.eloRating || 1500)) / 500;
  const formDiff = (home.formRating || 0.5) - (away.formRating || 0.5);
  const xgDiff = ((home.xG || 1) - (away.xG || 1)) / 3;
  const injuryDiff = (away.injuriesSuspensionsImpact || 0) - (home.injuriesSuspensionsImpact || 0);
  return side * (eloDiff * 0.22 + formDiff * 0.22 + xgDiff * 0.18 + injuryDiff * 0.14);
};

export const MODEL_REGISTRY = {
  logisticRegression: {
    name: "Logistic Regression",
    predict: (bet, context) => {
      const baseline = marketBaselineProbability(bet);
      return clamp(baseline + teamSignal(context, bet), 0.03, 0.92);
    },
  },
  randomForest: {
    name: "Random Forest placeholder",
    predict: (bet, context) => {
      const baseline = marketBaselineProbability(bet);
      const stability = context?.homeTeam?.playerMinutesStability || 0.75;
      return clamp(baseline + ((stability - 0.75) * 0.12), 0.03, 0.92);
    },
  },
  gradientBoosting: {
    name: "XGBoost/LightGBM placeholder",
    predict: (bet, context) => {
      const baseline = marketBaselineProbability(bet);
      const signal = teamSignal(context, bet);
      return clamp(sigmoid(Math.log(baseline / Math.max(1 - baseline, 0.01)) + signal * 1.25), 0.03, 0.92);
    },
  },
  poissonGoals: {
    name: "Poisson goals model placeholder",
    predict: (bet, context) => {
      const baseline = marketBaselineProbability(bet);
      const totalXg = (context?.homeTeam?.xG || 1.2) + (context?.awayTeam?.xG || 1.1);
      const goalsSignal = bet.marketType === "over_under" && String(bet.outcomeLabel).toLowerCase().includes("over")
        ? (totalXg - 2.45) * 0.08
        : 0;
      return clamp(baseline + goalsSignal, 0.03, 0.92);
    },
  },
  eloModel: {
    name: "Elo/FIFA model",
    predict: (bet, context) => {
      const baseline = marketBaselineProbability(bet);
      return clamp(baseline + teamSignal(context, bet) * 0.85, 0.03, 0.92);
    },
  },
};

export const predictBetProbability = (bet, context, modelNames = Object.keys(MODEL_REGISTRY)) => {
  const predictions = modelNames.map((name) => MODEL_REGISTRY[name].predict(bet, context));
  const modelProbability = predictions.reduce((sum, value) => sum + value, 0) / predictions.length;
  const uncertainty = Math.sqrt(predictions.reduce((sum, value) => sum + ((value - modelProbability) ** 2), 0) / predictions.length);

  return {
    modelProbability: clamp(modelProbability, 0.03, 0.92),
    modelUncertainty: clamp(uncertainty, 0.02, 0.28),
    modelNames,
  };
};
