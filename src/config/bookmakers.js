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
  unibet: "https://www.unibet.com/",
  unibet_se: "https://www.unibet.se/",
  williamhill: "https://sports.williamhill.com/",
};

export const bookmakerUrl = (bookmakerKey, fallbackUrl) => (
  fallbackUrl
  || BOOKMAKER_URLS[bookmakerKey]
  || null
);
