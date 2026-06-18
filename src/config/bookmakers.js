export const BOOKMAKER_URLS = {
  bet365: "https://www.bet365.com/",
  betfair: "https://www.betfair.com/",
  betway: "https://betway.com/",
  coolbet: "https://www.coolbet.com/",
  draftkings: "https://sportsbook.draftkings.com/",
  fanduel: "https://sportsbook.fanduel.com/",
  grosvenor: "https://www.grosvenorcasinos.com/sport",
  leovegas: "https://www.leovegas.com/",
  leovegas_se: "https://www.leovegas.se/",
  livescorebet: "https://www.livescorebet.com/",
  marathonbet: "https://www.marathonbet.com/",
  nordicbet: "https://www.nordicbet.com/",
  pinnacle: "https://www.pinnacle.com/",
  rainbet: "https://rainbet.com/sports",
  rainbet_sportsbook: "https://rainbet.com/sports",
  roobet: "https://roobet.com/",
  roobet_sportsbook: "https://roobet.com/sports",
  norsk_tipping: "https://www.norsk-tipping.no/sport",
  norsktipping: "https://www.norsk-tipping.no/sport",
  stake: "https://stake.com/sports",
  stake_com: "https://stake.com/sports",
  unibet: "https://www.unibet.com/",
  unibet_se: "https://www.unibet.se/",
  williamhill: "https://sports.williamhill.com/",
};

export const bookmakerUrl = (bookmakerKey, fallbackUrl) => (
  fallbackUrl
  || BOOKMAKER_URLS[bookmakerKey]
  || null
);
