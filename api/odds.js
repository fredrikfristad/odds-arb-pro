const ODDS_API_HOST = "https://api.the-odds-api.com";

const DEFAULT_SPORTS = "soccer_fifa_world_cup,upcoming";

export default async function handler(request, response) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: "Missing ODDS_API_KEY on server" });
    return;
  }

  const url = new URL(request.url, `https://${request.headers.host}`);
  const sports = (url.searchParams.get("sports") || process.env.ODDS_SPORTS || DEFAULT_SPORTS)
    .split(",")
    .map((sport) => sport.trim())
    .filter(Boolean);
  const regions = url.searchParams.get("regions") || process.env.ODDS_REGIONS || "eu,uk";
  const markets = url.searchParams.get("markets") || process.env.ODDS_MARKETS || "h2h,totals";

  const events = [];
  let quota = null;

  try {
    for (const sport of sports) {
      const params = new URLSearchParams({
        apiKey,
        regions,
        markets,
        oddsFormat: "decimal",
        dateFormat: "iso",
      });

      const upstream = await fetch(`${ODDS_API_HOST}/v4/sports/${sport}/odds/?${params}`);
      quota = {
        remaining: upstream.headers.get("x-requests-remaining"),
        used: upstream.headers.get("x-requests-used"),
        last: upstream.headers.get("x-requests-last"),
      };

      if (upstream.status === 404) continue;
      if (!upstream.ok) {
        response.status(upstream.status).json({ error: await upstream.text(), quota });
        return;
      }

      events.push(...await upstream.json());
    }

    response.setHeader("Cache-Control", "s-maxage=25, stale-while-revalidate=25");
    response.status(200).json({ events, quota, source: "the_odds_api_proxy" });
  } catch (error) {
    response.status(500).json({ error: error?.message || "Could not fetch odds" });
  }
}
