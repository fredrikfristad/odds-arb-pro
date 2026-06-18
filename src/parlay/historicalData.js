const hash = (value) => [...String(value)].reduce((sum, char) => sum + char.charCodeAt(0), 0);

export const isWorldCupMatch = (match) => {
  const haystack = `${match.tournament || ""} ${match.round || ""} ${match.group || ""}`.toLowerCase();
  return haystack.includes("world cup")
    || haystack.includes("fifa")
    || haystack.includes("vm 2026")
    || haystack.includes("soccer_fifa_world_cup");
};

export const buildHistoricalContext = (match) => {
  const base = hash(`${match.homeTeam}-${match.awayTeam}-${match.startsAt}`);
  const worldCup = isWorldCupMatch(match);

  return {
    matchId: match.id,
    competitionId: worldCup ? "fifa-world-cup-2026" : (match.tournament || "unknown"),
    tournament: match.tournament,
    matchDate: match.startsAt,
    isWorldCup2026: worldCup,
    neutralVenue: worldCup,
    homeTeam: {
      teamId: match.homeTeam,
      formRating: 0.45 + ((base % 35) / 100),
      homeAwayStrength: worldCup ? 0.5 : 0.56,
      xG: 0.9 + ((base % 70) / 50),
      xGA: 0.7 + ((base % 55) / 60),
      goalsFor: 0.9 + ((base % 65) / 45),
      goalsAgainst: 0.7 + ((base % 45) / 45),
      shotsOnTarget: 3 + (base % 5),
      corners: 3 + (base % 6),
      cards: 1 + (base % 4),
      playerMinutesStability: 0.72 + ((base % 20) / 100),
      goalsAssistsForm: 0.45 + ((base % 28) / 100),
      injuriesSuspensionsImpact: (base % 18) / 100,
      eloRating: 1450 + (base % 420),
      fifaRating: 1300 + (base % 500),
      tournamentForm: worldCup ? 0.48 + ((base % 32) / 100) : null,
    },
    awayTeam: {
      teamId: match.awayTeam,
      formRating: 0.43 + (((base + 17) % 35) / 100),
      homeAwayStrength: worldCup ? 0.5 : 0.49,
      xG: 0.8 + (((base + 29) % 70) / 50),
      xGA: 0.75 + (((base + 11) % 55) / 60),
      goalsFor: 0.8 + (((base + 23) % 65) / 45),
      goalsAgainst: 0.75 + (((base + 19) % 45) / 45),
      shotsOnTarget: 3 + ((base + 2) % 5),
      corners: 3 + ((base + 3) % 6),
      cards: 1 + ((base + 1) % 4),
      playerMinutesStability: 0.7 + (((base + 13) % 20) / 100),
      goalsAssistsForm: 0.42 + (((base + 7) % 28) / 100),
      injuriesSuspensionsImpact: ((base + 5) % 18) / 100,
      eloRating: 1430 + ((base + 97) % 420),
      fifaRating: 1280 + ((base + 71) % 500),
      tournamentForm: worldCup ? 0.46 + (((base + 9) % 32) / 100) : null,
    },
    headToHead: {
      sampleSize: 0,
      homeWins: null,
      draws: null,
      awayWins: null,
    },
    oddsMovement: {
      openingOdds: null,
      currentOdds: null,
      closingOdds: null,
      movementPct: null,
    },
    dataQuality: {
      hasRealHistoricalStats: false,
      hasInjuries: false,
      hasClosingOdds: false,
      source: "placeholder-context-from-live-odds",
    },
  };
};

export const buildHistoricalDataset = (matches) => Object.fromEntries(
  (matches || []).map((match) => [match.id, buildHistoricalContext(match)]),
);
