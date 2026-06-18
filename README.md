# OddsArb Pro

React-prototype for en arbitrasje- og +EV-side for odds.

## Kjoring lokalt

```bash
npm install
cp .env.example .env
npm run dev
```

Deretter apner du URL-en Vite viser i terminalen, vanligvis `http://localhost:5173`.

## Live odds

Appen bruker The Odds API via `/api/odds` nar `ODDS_API_KEY` finnes pa serveren.

```bash
VITE_ODDS_API_KEY=
VITE_ODDS_PROXY_URL=/api/odds
VITE_ODDS_SPORTS=soccer_fifa_world_cup,upcoming
VITE_ODDS_REGIONS=eu,uk
VITE_ODDS_MARKETS=h2h,totals

ODDS_API_KEY=din_the_odds_api_nokkel
ODDS_SPORTS=soccer_fifa_world_cup,upcoming
ODDS_REGIONS=eu,uk
ODDS_MARKETS=h2h,totals
```

Uten API-nokkel faller appen tilbake til demo-data, men viser tydelig status i dashboardet.
Flere sport keys kan settes kommaseparert, men hvert sport/market/region-oppsett bruker API-kvote.

For produksjon ligger API-nokkelen pa serveren i `ODDS_API_KEY`. Ikke legg en ekte nokkel i `VITE_ODDS_API_KEY`, fordi `VITE_`-variabler blir synlige i nettleseren.

## Rask hosting pa Vercel

1. Last prosjektet opp til GitHub.
2. Gå til Vercel og importer repoet.
3. Sett build-innstillinger:
   - Framework: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
4. Legg inn Environment Variables i Vercel:
   - `ODDS_API_KEY`
   - `ODDS_SPORTS=soccer_fifa_world_cup,upcoming`
   - `ODDS_REGIONS=eu,uk`
   - `ODDS_MARKETS=h2h,totals`
   - `VITE_ODDS_PROXY_URL=/api/odds`
   - `VITE_ODDS_SPORTS=soccer_fifa_world_cup,upcoming`
5. Deploy.

`api/odds.js` er en Vercel serverless function som skjuler API-nokkelen og cacher responsen kort med `s-maxage=25`.

## Anbefalingsmotor

`src/engine/recommendations.js` lager anbefalinger ved a:

- hente beste odds per utfall
- fjerne bookmaker-margin fra markedssannsynligheten
- blande markedssannsynlighet med en enkel lagmodell for 1X2
- beregne EV og 25% Kelly innsats

Dette er en startmodell. For ekte presisjon bor du mate inn historiske kamper, xG, skudd, lagnyheter, skader, hvile, hjemmebane, form og closing line value.

## Hva som er med

- Dashboard med livekamper, arbitragekort, props og market movers
- VM 2026-liste med match-detail, oddsvisning, hedgeanalyse og arb-beregning
- Player props med EV, konfidans og Kelly-anbefaling
- Spillerprofiler
- Arbitrasjeside med innsatsfordeling
- Portfolio, market movers, settings og enkel AI-copilot

## Neste naturlige steg

- Bytte mockdata i `src/App.jsx` med ekte odds-API
- Koble historiske kamp- og lagdata fra API-FOOTBALL, football-data.org, StatsBomb eller egen database
- Splitte `App.jsx` i mindre komponenter nar funksjonaliteten stabiliserer seg
- Legge til varsel/logg for historiske arbitrasjevinduer
- Legge inn tester for `calcArb`, `kelly`, `calcEV` og hedge-beregningene
