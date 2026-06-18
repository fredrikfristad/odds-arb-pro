const ODDS_API_HOST = "https://api.the-odds-api.com";

const DEFAULT_SPORTS = "soccer_fifa_world_cup,upcoming";

export default async function handler(request, response) {
  const apiKeys = (process.env.ODDS_API_KEYS || process.env.ODDS_API_KEY || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  if (!apiKeys.length) {
    response.status(500).json({ error: "Missing ODDS_API_KEY or ODDS_API_KEYS on server" });
    return;
  }

  const url = new URL(request.url, `https://${request.headers.host}`);
  const sports = (url.searchParams.get("sports") || process.env.ODDS_SPORTS || DEFAULT_SPORTS)
    .split(",")
    .map((sport) => sport.trim())
    .filter(Boolean);
  const regions = url.searchParams.get("regions") || process.env.ODDS_REGIONS || "eu,uk";
  const markets = url.searchParams.get("markets") || process.env.ODDS_MARKETS || "h2h,totals";

  try {
    const exhausted = [];

    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex += 1) {
      const apiKey = apiKeys[keyIndex];
      const events = [];
      let quota = null;
      let keyExhausted = false;

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
          keyIndex,
          remaining: upstream.headers.get("x-requests-remaining"),
          used: upstream.headers.get("x-requests-used"),
          last: upstream.headers.get("x-requests-last"),
        };

        if (upstream.status === 404) continue;
        if (!upstream.ok) {
          const errorText = await upstream.text();
          if (errorText.includes("OUT_OF_USAGE_CREDITS")) {
            exhausted.push({ keyIndex, quota });
            keyExhausted = true;
            break;
          }

          response.status(upstream.status).json({ error: errorText, quota });
          return;
        }

        events.push(...await upstream.json());
      }

      if (keyExhausted) continue;

      response.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=600");
      response.status(200).json({
        events,
        quota,
        exhausted,
        activeKeyIndex: keyIndex,
        source: "the_odds_api_proxy",
      });
      return;
    }

    response.status(429).json({
      error: "All configured Odds API keys are out of usage credits",
      exhausted,
    });
  } catch (error) {
    response.status(500).json({ error: error?.message || "Could not fetch odds" });
  }
}
