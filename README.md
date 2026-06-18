# OddsArb Pro

Live odds-app for VM og kommende fotballkamper.

Denne versjonen viser bare data fra ekte API-kall. Demo-bets, fiktiv portefolje, fiktive player props og hardkodet statistikk er fjernet.

## Kjoring lokalt

```bash
npm install
cp .env.example .env
npm run dev
```

## Live data

Frontend henter fra `/api/odds`. Vercel-funksjonen `api/odds.js` kaller The Odds API med server-side nokkel.

Sett disse i Vercel Environment Variables:

```text
ODDS_API_KEY=din_the_odds_api_nokkel
ODDS_API_KEYS=nokkel_1,nokkel_2,nokkel_3
ODDS_SPORTS=soccer_fifa_world_cup,upcoming
ODDS_REGIONS=eu,uk
ODDS_MARKETS=h2h,totals
VITE_ODDS_PROXY_URL=/api/odds
VITE_ODDS_SPORTS=soccer_fifa_world_cup,upcoming
```

Ikke legg en ekte API-nokkel i `VITE_ODDS_API_KEY`.

`ODDS_API_KEYS` er valgfritt. Bruk det bare for API-nøkler du lovlig har tilgang til. Serveren prøver neste nøkkel hvis en nøkkel svarer med `OUT_OF_USAGE_CREDITS`.

## Hva appen viser

- Egen VM 2026-side på `/world-cup-2026`
- Live VM/football odds fra The Odds API
- Beste odds per utfall
- Arbitrasje basert pa ekte odds
- Dedikert arbitrasje-seksjon på VM-siden med stake-fordeling
- Nær-arbitrasje når implisert sannsynlighet er under 102%
- Bookmaker-sammenligning og eksterne lenker til bookmakere
- Parlay Generator med single-bet value engine, korrelasjonskontroll og Monte Carlo-simulering
- API-status og kvote
- Min side uten fiktiv bet-historikk

Appen henter odds ved innlasting og deretter kun når brukeren trykker Oppdater. Vercel-cachen er fortsatt 10 minutter for a spare API-kvote.

Bookmaker-lenker bruker URL fra oddsdata dersom leverandøren sender det. Hvis ikke brukes fallback i `src/config/bookmakers.js`. Hvis en bookmaker mangler URL, vises oddsen uten ekstern lenke.

## Hva appen ikke later som

- Ingen fiktive bets
- Ingen fiktiv portefolje
- Ingen fiktive spillerprops
- Ingen hardkodet form/xG/statistikk
- Ingen +EV-anbefalinger uten en faktisk statistikkmodell

For ekte sannsynlighetsbaserte anbefalinger ma neste steg være a koble til en statistikkilde og database, for eksempel API-FOOTBALL, StatsBomb, football-data.org eller en egen historisk kampdatabase.

## Parlay Generator

Parlay-modulen ligger i `src/parlay/`:

- `historicalData.js`: modellklar struktur for form, xG/xGA, skudd, corners, kort, spillerminutter, skader, head-to-head, Elo/FIFA og VM 2026-markering.
- `modelLayer.js`: placeholder-arkitektur for Logistic Regression, Random Forest, XGBoost/LightGBM, Poisson og Elo.
- `valueEngine.js`: beregner implied probability, edge og expected value per single bet.
- `correlationEngine.js`: blokkerer eller straffer korrelerte legs.
- `scoringEngine.js`: scorer parleys med EV, treffrate, oddsverdi, korrelasjon, usikkerhet og stabilitet.
- `simulationEngine.js`: Monte Carlo-simulering.
- `parlayGenerator.js`: bygger Safe, Balanced, High Risk, Player Props, Same Game, AI Value og VM 2026-parlays.

Historikkfeltene er placeholders frem til ekte statistikkilde kobles på, men dataformen er lagt opp for produksjonsintegrasjon.

