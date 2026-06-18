const seededRandom = (seed) => {
  let value = seed % 2147483647;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

export const simulateParlay = (legs, {
  stake = 100,
  iterations = 5000,
  seed = 1337,
} = {}) => {
  const random = seededRandom(seed + legs.length);
  const totalOdds = legs.reduce((acc, leg) => acc * leg.odds, 1);
  const payout = stake * totalOdds;
  const returns = [];
  let bankroll = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let wins = 0;

  for (let i = 0; i < iterations; i += 1) {
    const hit = legs.every((leg) => random() <= leg.modelProbability);
    const profit = hit ? payout - stake : -stake;
    returns.push(profit);
    if (hit) wins += 1;
    bankroll += profit;
    peak = Math.max(peak, bankroll);
    maxDrawdown = Math.min(maxDrawdown, bankroll - peak);
  }

  const avgReturn = returns.reduce((sum, value) => sum + value, 0) / iterations;
  const variance = returns.reduce((sum, value) => sum + ((value - avgReturn) ** 2), 0) / iterations;

  return {
    iterations,
    hitRate: wins / iterations,
    expectedReturn: avgReturn,
    variance,
    risk: Math.sqrt(variance),
    maxDrawdown,
    lossProbability: 1 - (wins / iterations),
  };
};
