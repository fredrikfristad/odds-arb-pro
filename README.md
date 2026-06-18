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
ODDS_SPORTS=soccer_fifa_world_cup,upcoming
ODDS_REGIONS=eu,uk
ODDS_MARKETS=h2h,totals
VITE_ODDS_PROXY_URL=/api/odds
VITE_ODDS_SPORTS=soccer_fifa_world_cup,upcoming
```

Ikke legg en ekte API-nokkel i `VITE_ODDS_API_KEY`.

## Hva appen viser

- Live VM/football odds fra The Odds API
- Beste odds per utfall
- Arbitrasje basert pa ekte odds
- Nær-arbitrasje når implisert sannsynlighet er under 102%
- API-status og kvote
- Min side uten fiktiv bet-historikk

Appen oppdaterer automatisk hvert 10. minutt for a spare API-kvote. Bruk Oppdater-knappen ved behov.

## Hva appen ikke later som

- Ingen fiktive bets
- Ingen fiktiv portefolje
- Ingen fiktive spillerprops
- Ingen hardkodet form/xG/statistikk
- Ingen +EV-anbefalinger uten en faktisk statistikkmodell

For ekte sannsynlighetsbaserte anbefalinger ma neste steg være a koble til en statistikkilde og database, for eksempel API-FOOTBALL, StatsBomb, football-data.org eller en egen historisk kampdatabase.
