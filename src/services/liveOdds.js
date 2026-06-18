import { bookmakerUrl } from "../config/bookmakers.js";

const ODDS_API_HOST = "https://api.the-odds-api.com";

const DEFAULT_SPORTS = [
  "soccer_fifa_world_cup",
  "upcoming",
];

const MARKET_LABELS = {
  h2h: "Kampresultat",
  h2h_3_way: "Kampresultat",
  totals: "Over/Under",
  spreads: "Handicap",
  btts: "Begge lag scorer",
  double_chance: "Dobbelsjanse",
  team_totals: "Lag totalt mål",
  alternate_totals: "Over/Under",
  alternate_spreads: "Asian handicap",
  correct_score: "Korrekt resultat",
  player_goal_scorer_anytime: "Spiller scorer",
  player_first_goal_scorer: "Første målscorer",
  player_shots_on_target: "Skudd på mål",
  cards: "Kort",
  corners: "Cornere",
  clean_sheet: "Clean sheet",
  win_and_btts: "Seier + begge lag scorer",
  win_and_totals: "Seier + over/under",
};

const MARKET_TYPES = {
  h2h: "1x2",
  h2h_3_way: "1x2",
  totals: "over_under",
  alternate_totals: "over_under",
  spreads: "spread",
  alternate_spreads: "asian_handicap",
  btts: "btts",
  double_chance: "double_chance",
  team_totals: "team_total_goals",
  correct_score: "correct_score",
  player_goal_scorer_anytime: "player_scorer",
  player_first_goal_scorer: "first_goalscorer",
  player_shots_on_target: "shots_on_target",
  cards: "cards",
  corners: "corners",
  clean_sheet: "clean_sheet",
  win_and_btts: "win_btts",
  win_and_totals: "win_totals",
};

const outcomeId = (name, homeTeam, awayTeam) => {
  const n = String(name).toLowerCase();
  if (n === String(homeTeam).toLowerCase()) return "home";
  if (n === String(awayTeam).toLowerCase()) return "away";
  if (n === "draw") return "draw";
  if (n.includes("over")) return "over";
  if (n.includes("under")) return "under";
  return n.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
};

const groupEventMarkets = (event) => {
  const markets = new Map();

  for (const bookmaker of event.bookmakers || []) {
    for (const market of bookmaker.markets || []) {
      const marketKey = `${market.key}${market.point ? `-${market.point}` : ""}`;
      if (!markets.has(marketKey)) {
        markets.set(marketKey, {
          id: marketKey,
          type: MARKET_TYPES[market.key] || market.key,
          label: MARKET_LABELS[market.key] || market.key,
          outcomes: new Map(),
        });
      }

      const localMarket = markets.get(marketKey);
      for (const outcome of market.outcomes || []) {
        const id = outcomeId(outcome.name, event.home_team, event.away_team);
        const label = market.key === "totals" && outcome.point
          ? `${outcome.name} ${outcome.point}`
          : outcome.name;

        if (!localMarket.outcomes.has(id)) {
          localMarket.outcomes.set(id, { id, label, odds: [] });
        }

        localMarket.outcomes.get(id).odds.push({
          bookmaker: bookmaker.key,
          bookmakerName: bookmaker.title,
          bookmakerUrl: bookmakerUrl(bookmaker.key, bookmaker.link || bookmaker.url),
          decimalOdds: Number(outcome.price),
          fetchedAt: bookmaker.last_update || new Date().toISOString(),
          point: outcome.point,
          isMock: false,
        });
      }
    }
  }

  return [...markets.values()].map((market) => ({
    ...market,
    outcomes: [...market.outcomes.values()].filter((outcome) => outcome.odds.length),
  })).filter((market) => market.outcomes.length >= 2);
};

const eventStatus = (startsAt) => {
  const starts = new Date(startsAt).getTime();
  const now = Date.now();
  if (starts <= now && now - starts < 3 * 60 * 60 * 1000) return "live";
  return starts < now ? "finished" : "upcoming";
};

const normalizeOddsEvent = (event) => ({
  id: event.id,
  tournament: event.sport_title || event.sport_key,
  round: "Live odds",
  group: "",
  homeTeam: event.home_team,
  awayTeam: event.away_team,
  he: "",
  ae: "",
  startsAt: event.commence_time,
  status: eventStatus(event.commence_time),
  markets: groupEventMarkets(event),
});

export async function fetchLiveOdds({
  apiKey = import.meta.env?.VITE_ODDS_API_KEY,
  sports = (import.meta.env?.VITE_ODDS_SPORTS || "").split(",").map((s) => s.trim()).filter(Boolean),
  regions = import.meta.env?.VITE_ODDS_REGIONS || "eu,uk",
  markets = import.meta.env?.VITE_ODDS_MARKETS || "h2h,totals",
  proxyUrl = import.meta.env?.VITE_ODDS_PROXY_URL || "/api/odds",
  oddsFormat = "decimal",
  signal,
} = {}) {
  if (!apiKey) {
    const params = new URLSearchParams({
      sports: (sports.length ? sports : DEFAULT_SPORTS).join(","),
      regions,
      markets,
    });
    const response = await fetch(`${proxyUrl}?${params}`, { signal });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Odds proxy ${response.status}: ${message}`);
    }
    const result = await response.json();
    return {
      matches: (result.events || []).map(normalizeOddsEvent).filter((match) => match.markets.length),
      source: "the_odds_api_proxy",
      quota: result.quota,
    };
  }

  const collected = [];
  let quota = null;

  for (const sport of sports.length ? sports : DEFAULT_SPORTS) {
    const params = new URLSearchParams({
      apiKey,
      regions,
      markets,
      oddsFormat,
      dateFormat: "iso",
    });

    const response = await fetch(`${ODDS_API_HOST}/v4/sports/${sport}/odds/?${params}`, { signal });
    quota = {
      remaining: response.headers.get("x-requests-remaining"),
      used: response.headers.get("x-requests-used"),
      last: response.headers.get("x-requests-last"),
    };

    if (response.status === 404) continue;
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Odds API ${response.status}: ${message}`);
    }

    const events = await response.json();
    collected.push(...events.map(normalizeOddsEvent).filter((match) => match.markets.length));
  }

  return {
    matches: collected.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)),
    source: "the_odds_api",
    quota,
  };
}

export const LIVE_ODDS_DEFAULT_SPORTS = DEFAULT_SPORTS;
