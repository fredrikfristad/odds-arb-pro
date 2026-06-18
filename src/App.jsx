import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchLiveOdds } from "./services/liveOdds.js";
import { bestOddsForOutcome, findArbitrage } from "./engine/recommendations.js";

const C = {
  bg: "#050810",
  surface: "#0d1117",
  glass: "rgba(255,255,255,0.045)",
  surfaceUp: "#161d2b",
  border: "#1a2540",
  text: "#f2f2f7",
  muted: "#8e8e93",
  dim: "#4f5868",
  accent: "#0a84ff",
  accentDim: "rgba(10,132,255,0.15)",
  green: "#30d158",
  greenDim: "rgba(48,209,88,0.15)",
  amber: "#ffd60a",
  amberDim: "rgba(255,214,10,0.14)",
  red: "#ff453a",
  redDim: "rgba(255,69,58,0.14)",
  purple: "#bf5af2",
  purpleDim: "rgba(191,90,242,0.14)",
};

const css = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; background: ${C.bg}; color: ${C.text}; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  button, input, select { font: inherit; }
  button { -webkit-tap-highlight-color: transparent; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const fmtTime = (iso) => new Date(iso).toLocaleString("no-NO", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const pct = (n) => `${(n * 100).toFixed(2)}%`;
const money = (n) => `NOK ${Math.round(n).toLocaleString("no-NO")}`;

const buttonStyle = {
  background: C.accentDim,
  color: C.accent,
  border: `1px solid ${C.accent}66`,
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const Spinner = () => (
  <span style={{
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: `2px solid ${C.border}`,
    borderTopColor: C.accent,
    animation: "spin .8s linear infinite",
    display: "inline-block",
  }} />
);

const Badge = ({ children, color = C.accent, bg = C.accentDim }) => (
  <span style={{
    color,
    background: bg,
    borderRadius: 5,
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: ".03em",
    whiteSpace: "nowrap",
  }}>
    {children}
  </span>
);

const Card = ({ children, style = {}, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: C.glass,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: 14,
      cursor: onClick ? "pointer" : "default",
      ...style,
    }}
  >
    {children}
  </div>
);

const Section = ({ title, children, right }) => (
  <section style={{ marginBottom: 18 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 }}>
      <h2 style={{
        margin: 0,
        fontSize: 12,
        color: C.muted,
        textTransform: "uppercase",
        letterSpacing: ".08em",
      }}>
        {title}
      </h2>
      {right}
    </div>
    {children}
  </section>
);

const EmptyState = ({ title, text }) => (
  <Card style={{ textAlign: "center", padding: "38px 20px" }}>
    <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{title}</div>
    <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55 }}>{text}</div>
  </Card>
);

const useLocalState = (key, initialValue) => {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local storage can be unavailable in private modes.
    }
  }, [key, value]);

  return [value, setValue];
};

const getBookmakers = (matches) => {
  const books = new Map();
  for (const match of matches) {
    for (const market of match.markets) {
      for (const outcome of market.outcomes) {
        for (const odd of outcome.odds) {
          const id = odd.bookmakerName || odd.bookmaker;
          books.set(id, (books.get(id) || 0) + 1);
        }
      }
    }
  }
  return [...books.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
};

const flattenArbs = (matches, stake = 1000) => matches.flatMap((match) => match.markets
  .map((market) => ({ match, arb: findArbitrage(market, stake) }))
  .filter((item) => item.arb?.isArb || item.arb?.isNearArb))
  .sort((a, b) => b.arb.margin - a.arb.margin);

const StatusPanel = ({ loading, source, error, quota, updatedAt, matchCount }) => {
  const live = source === "the_odds_api" || source === "the_odds_api_proxy";
  return (
    <Card style={{ borderColor: live ? `${C.green}55` : `${C.amber}55`, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {loading ? <Spinner /> : <span style={{ color: live ? C.green : C.amber, fontSize: 13 }}>●</span>}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>
            {live ? "Live odds aktiv" : "Ingen live odds lastet"}
          </div>
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.45 }}>
            {live
              ? `${matchCount} kamper fra The Odds API${quota?.remaining ? ` · ${quota.remaining} kall igjen` : ""}`
              : error || "Sjekk ODDS_API_KEY og /api/odds."}
          </div>
        </div>
        {updatedAt && <div style={{ color: C.dim, fontSize: 11 }}>{new Date(updatedAt).toLocaleTimeString("no-NO")}</div>}
      </div>
    </Card>
  );
};

const Metric = ({ label, value, color = C.text, sub }) => (
  <Card>
    <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>{label}</div>
    <div style={{ color, fontWeight: 900, fontSize: 22 }}>{value}</div>
    {sub && <div style={{ color: C.dim, fontSize: 10, marginTop: 3 }}>{sub}</div>}
  </Card>
);

const Filters = ({ search, setSearch, marketFilter, setMarketFilter, sort, setSort }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginBottom: 12 }}>
    <input
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      placeholder="Søk kamp eller lag"
      style={{
        minWidth: 0,
        background: C.surfaceUp,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        color: C.text,
        padding: "9px 11px",
        outline: "none",
      }}
    />
    <select value={marketFilter} onChange={(event) => setMarketFilter(event.target.value)} style={selectStyle}>
      <option value="all">Alle markeder</option>
      <option value="1x2">1X2</option>
      <option value="over_under">Over/Under</option>
    </select>
    <select value={sort} onChange={(event) => setSort(event.target.value)} style={selectStyle}>
      <option value="time">Tid</option>
      <option value="books">Bookmakere</option>
      <option value="arb">Arb først</option>
    </select>
  </div>
);

const selectStyle = {
  background: C.surfaceUp,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  padding: "9px 10px",
  outline: "none",
};

const OddsGrid = ({ market }) => (
  <div style={{ display: "grid", gap: 8 }}>
    {market.outcomes.map((outcome) => {
      const best = bestOddsForOutcome(outcome);
      const implied = 1 / best.decimalOdds;
      return (
        <div key={outcome.id} style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 10,
          alignItems: "center",
          background: C.surfaceUp,
          borderRadius: 8,
          padding: "10px 12px",
        }}>
          <div>
            <div style={{ fontWeight: 750, fontSize: 13 }}>{outcome.label}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>{best.bookmakerName || best.bookmaker} · impl. {pct(implied)}</div>
          </div>
          <div style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            color: C.accent,
            fontWeight: 900,
            fontSize: 18,
          }}>
            {best.decimalOdds.toFixed(2)}
          </div>
        </div>
      );
    })}
  </div>
);

const MatchCard = ({ match, onSelect, watchlist, toggleWatch }) => {
  const h2h = match.markets.find((market) => market.type === "1x2") || match.markets[0];
  const arb = h2h ? findArbitrage(h2h) : null;
  const bookCount = getBookmakers([match]).length;
  const watched = watchlist.includes(match.id);

  return (
    <Card style={{ marginBottom: 10, borderColor: arb?.isArb ? `${C.green}66` : C.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div onClick={() => onSelect(match)} style={{ minWidth: 0, flex: 1, cursor: "pointer" }}>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 5 }}>
            {match.tournament} · {fmtTime(match.startsAt)} · {bookCount} books
          </div>
          <div style={{ fontWeight: 900, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {match.homeTeam} vs {match.awayTeam}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          {arb?.isArb && <Badge color={C.green} bg={C.greenDim}>ARB {pct(arb.margin)}</Badge>}
          {!arb?.isArb && arb?.isNearArb && <Badge color={C.amber} bg={C.amberDim}>Nær arb</Badge>}
          <button onClick={() => toggleWatch(match.id)} style={{
            ...buttonStyle,
            padding: "5px 8px",
            background: watched ? C.purpleDim : "transparent",
            color: watched ? C.purple : C.muted,
            borderColor: watched ? `${C.purple}66` : C.border,
          }}>
            {watched ? "Lagret" : "Lagre"}
          </button>
        </div>
      </div>
      {h2h && <OddsGrid market={h2h} />}
    </Card>
  );
};

const Dashboard = ({ matches, loading, source, error, quota, updatedAt, onRefresh, onSelect, watchlist, toggleWatch }) => {
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState("all");
  const [sort, setSort] = useState("time");

  const arbs = useMemo(() => flattenArbs(matches), [matches]);
  const books = useMemo(() => getBookmakers(matches), [matches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matches
      .filter((match) => {
        const textMatch = !q || `${match.homeTeam} ${match.awayTeam} ${match.tournament}`.toLowerCase().includes(q);
        const marketMatch = marketFilter === "all" || match.markets.some((market) => market.type === marketFilter);
        return textMatch && marketMatch;
      })
      .sort((a, b) => {
        if (sort === "books") return getBookmakers([b]).length - getBookmakers([a]).length;
        if (sort === "arb") {
          const aBest = Math.max(...a.markets.map((market) => findArbitrage(market)?.margin || -1));
          const bBest = Math.max(...b.markets.map((market) => findArbitrage(market)?.margin || -1));
          return bBest - aBest;
        }
        return new Date(a.startsAt) - new Date(b.startsAt);
      });
  }, [matches, marketFilter, search, sort]);

  return (
    <div>
      <StatusPanel loading={loading} source={source} error={error} quota={quota} updatedAt={updatedAt} matchCount={matches.length} />

      <Section title="Live oversikt" right={<button onClick={onRefresh} style={buttonStyle}>Oppdater</button>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          <Metric label="Kamper" value={matches.length} />
          <Metric label="Arb/nær" value={arbs.length} color={arbs.length ? C.green : C.text} />
          <Metric label="Bookmakere" value={books.length} color={C.accent} />
          <Metric label="Lagret" value={watchlist.length} color={C.purple} />
        </div>
      </Section>

      <Section title="Beste muligheter fra ekte odds">
        {arbs.length ? arbs.slice(0, 4).map(({ match, arb }) => (
          <ArbCard key={`${match.id}-${arb.marketId}`} match={match} arb={arb} compact />
        )) : (
          <EmptyState
            title="Ingen arbitrasje akkurat nå"
            text="Dette er normalt. Appen viser kun muligheter som faktisk finnes i live odds-dataene."
          />
        )}
      </Section>

      <Section title="Kamper">
        <Filters
          search={search}
          setSearch={setSearch}
          marketFilter={marketFilter}
          setMarketFilter={setMarketFilter}
          sort={sort}
          setSort={setSort}
        />
        {filtered.length ? filtered.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            onSelect={onSelect}
            watchlist={watchlist}
            toggleWatch={toggleWatch}
          />
        )) : (
          <EmptyState
            title="Ingen kamper matcher filteret"
            text="Endre søk/filter, eller sjekk om The Odds API returnerer kamper for valgt sport."
          />
        )}
      </Section>
    </div>
  );
};

const ArbCard = ({ match, arb, compact = false }) => (
  <Card style={{ marginBottom: 10, borderColor: arb.isArb ? `${C.green}66` : `${C.amber}66` }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 5 }}>
          {arb.isArb ? <Badge color={C.green} bg={C.greenDim}>ARB {pct(arb.margin)}</Badge> : <Badge color={C.amber} bg={C.amberDim}>Nær arb</Badge>}
        </div>
        <div style={{ fontWeight: 850 }}>{match.homeTeam} vs {match.awayTeam}</div>
        <div style={{ color: C.muted, fontSize: 12 }}>{arb.marketLabel}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: arb.isArb ? C.green : C.amber, fontWeight: 900 }}>
          {arb.isArb ? `+${money(arb.profit)}` : pct(arb.impliedTotal)}
        </div>
        <div style={{ color: C.muted, fontSize: 11 }}>{arb.isArb ? "per 1000" : "impl. sum"}</div>
      </div>
    </div>
    {!compact && (
      <div style={{ display: "grid", gap: 6 }}>
        {arb.legs.map((leg) => (
          <div key={leg.outcomeId} style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 12 }}>
            <span>{leg.outcomeLabel} · {leg.bookmaker}</span>
            <span style={{ color: C.text }}>{leg.odds.toFixed(2)} · {money(leg.stake)}</span>
          </div>
        ))}
      </div>
    )}
  </Card>
);

const ArbitrageScreen = ({ matches }) => {
  const [stake, setStake] = useState(1000);
  const arbs = useMemo(() => flattenArbs(matches, stake), [matches, stake]);

  return (
    <div>
      <Section title="Arbitrasje-kalkulator">
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: C.muted, fontSize: 13 }}>Total innsats</span>
            <strong>{money(stake)}</strong>
          </div>
          <input
            type="number"
            min="10"
            value={stake}
            onChange={(event) => setStake(Math.max(10, Number(event.target.value) || 10))}
            style={{
              width: "100%",
              background: C.surfaceUp,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              color: C.text,
              padding: "10px 12px",
              outline: "none",
            }}
          />
        </Card>
        {arbs.length ? arbs.map(({ match, arb }) => (
          <ArbCard key={`${match.id}-${arb.marketId}`} match={match} arb={arb} />
        )) : (
          <EmptyState title="Ingen arbitrage/nær-arb" text="Når oddsene gir en reell mulighet, dukker den opp her med innsatsfordeling." />
        )}
      </Section>
    </div>
  );
};

const MarketTable = ({ market }) => {
  const bookmakers = [...new Set(market.outcomes.flatMap((outcome) => outcome.odds.map((odd) => odd.bookmakerName || odd.bookmaker)))];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr>
            <th style={thStyle}>Utfall</th>
            {bookmakers.map((book) => <th key={book} style={thStyle}>{book}</th>)}
          </tr>
        </thead>
        <tbody>
          {market.outcomes.map((outcome) => (
            <tr key={outcome.id}>
              <td style={tdStyle}>{outcome.label}</td>
              {bookmakers.map((book) => {
                const odd = outcome.odds.find((item) => (item.bookmakerName || item.bookmaker) === book);
                const best = bestOddsForOutcome(outcome);
                const isBest = odd && odd.decimalOdds === best.decimalOdds;
                return (
                  <td key={book} style={{ ...tdStyle, color: isBest ? C.green : C.text, fontWeight: isBest ? 900 : 500 }}>
                    {odd ? odd.decimalOdds.toFixed(2) : "-"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const thStyle = {
  textAlign: "left",
  color: C.muted,
  fontSize: 11,
  padding: "8px 10px",
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "9px 10px",
  borderBottom: `1px solid rgba(255,255,255,0.06)`,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const MatchDetail = ({ match, onBack, watchlist, toggleWatch }) => {
  const arbs = match.markets.map((market) => findArbitrage(market)).filter(Boolean);
  const watched = watchlist.includes(match.id);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={onBack} style={buttonStyle}>Tilbake</button>
        <button onClick={() => toggleWatch(match.id)} style={{
          ...buttonStyle,
          background: watched ? C.purpleDim : "transparent",
          color: watched ? C.purple : C.muted,
          borderColor: watched ? `${C.purple}66` : C.border,
        }}>
          {watched ? "Fjern fra Min side" : "Lagre kamp"}
        </button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>{match.tournament} · {fmtTime(match.startsAt)}</div>
        <div style={{ fontSize: 22, fontWeight: 950 }}>{match.homeTeam}</div>
        <div style={{ color: C.muted, margin: "3px 0" }}>vs</div>
        <div style={{ fontSize: 22, fontWeight: 950 }}>{match.awayTeam}</div>
      </Card>

      <Section title="Kampstatistikk">
        <Card>
          <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55 }}>
            Ekte kampstatistikk som xG, skudd, form, skader og lagnyheter er ikke koblet til ennå. Denne siden viser derfor kun statistikk utledet fra live odds: markeder, bookmakere, implisert sannsynlighet og arbitrasje.
          </div>
        </Card>
      </Section>

      <Section title="Markeder og beste odds">
        {match.markets.map((market) => {
          const arb = arbs.find((item) => item.marketId === market.id);
          return (
            <Card key={market.id} style={{ marginBottom: 10, borderColor: arb?.isArb ? `${C.green}66` : C.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 850 }}>{market.label}</div>
                  {arb && <div style={{ color: C.muted, fontSize: 11 }}>Impl. sum: {pct(arb.impliedTotal)}</div>}
                </div>
                {arb?.isArb && <Badge color={C.green} bg={C.greenDim}>ARB</Badge>}
              </div>
              <OddsGrid market={market} />
              <div style={{ marginTop: 12 }}>
                <MarketTable market={market} />
              </div>
            </Card>
          );
        })}
      </Section>
    </div>
  );
};

const BookmakersScreen = ({ matches }) => {
  const books = useMemo(() => getBookmakers(matches), [matches]);
  return (
    <Section title="Bookmakere i live-feed">
      {books.length ? books.map((book) => (
        <Card key={book.name} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>{book.name}</strong>
            <span style={{ color: C.muted }}>{book.count} odds</span>
          </div>
        </Card>
      )) : (
        <EmptyState title="Ingen bookmakere" text="Bookmakere vises når API-et returnerer odds." />
      )}
    </Section>
  );
};

const Account = ({ matches, watchlist, toggleWatch, source, quota }) => {
  const saved = matches.filter((match) => watchlist.includes(match.id));
  return (
    <div>
      <Section title="Bruker">
        <Card style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Min side</div>
          <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55 }}>
            Lagrede kamper lagres lokalt i nettleseren. Ekte konto/innlogging og synkronisering mellom enheter krever Supabase, Clerk eller Firebase.
          </div>
        </Card>
        <Card>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: C.muted }}>Datakilde</span>
              <span>{source === "the_odds_api_proxy" ? "The Odds API via Vercel" : source}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: C.muted }}>API-kvote igjen</span>
              <span>{quota?.remaining || "Ukjent"}</span>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Lagrede kamper">
        {saved.length ? saved.map((match) => (
          <Card key={match.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <strong>{match.homeTeam} vs {match.awayTeam}</strong>
                <div style={{ color: C.muted, fontSize: 12 }}>{fmtTime(match.startsAt)}</div>
              </div>
              <button onClick={() => toggleWatch(match.id)} style={{ ...buttonStyle, background: "transparent", color: C.red, borderColor: `${C.red}66` }}>
                Fjern
              </button>
            </div>
          </Card>
        )) : (
          <EmptyState title="Ingen lagrede kamper" text="Trykk Lagre på en kamp for å følge den her." />
        )}
      </Section>
    </div>
  );
};

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("loading");
  const [error, setError] = useState(null);
  const [quota, setQuota] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [watchlist, setWatchlist] = useLocalState("oddsarb-watchlist", []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLiveOdds();
      setMatches(result.matches || []);
      setSource(result.source);
      setQuota(result.quota);
      setError(result.matches?.length ? null : "API-et svarte, men returnerte ingen kamper.");
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err?.message || "Kunne ikke hente live odds.");
      setSource("error");
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  const toggleWatch = (matchId) => {
    setWatchlist((current) => current.includes(matchId)
      ? current.filter((id) => id !== matchId)
      : [...current, matchId]);
  };

  const nav = [
    { id: "dashboard", label: "Odds" },
    { id: "arbitrage", label: "Arb" },
    { id: "books", label: "Books" },
    { id: "account", label: "Min side" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <style>{css}</style>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 14px 80px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: "-.03em" }}>OddsArb Pro</div>
            <div style={{ color: C.muted, fontSize: 12 }}>Live odds, arbitrasje, bookmaker-sammenligning og lagrede kamper.</div>
          </div>
          {loading && <Spinner />}
        </header>

        <nav style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 10, overflowX: "auto" }}>
          {nav.map((item) => (
            <button key={item.id} onClick={() => { setTab(item.id); setSelected(null); }} style={{
              ...buttonStyle,
              background: tab === item.id ? C.accent : "transparent",
              color: tab === item.id ? "#fff" : C.muted,
              borderColor: tab === item.id ? C.accent : C.border,
            }}>
              {item.label}
            </button>
          ))}
        </nav>

        {selected ? (
          <MatchDetail match={selected} onBack={() => setSelected(null)} watchlist={watchlist} toggleWatch={toggleWatch} />
        ) : tab === "account" ? (
          <Account matches={matches} watchlist={watchlist} toggleWatch={toggleWatch} source={source} quota={quota} />
        ) : tab === "arbitrage" ? (
          <ArbitrageScreen matches={matches} />
        ) : tab === "books" ? (
          <BookmakersScreen matches={matches} />
        ) : (
          <Dashboard
            matches={matches}
            loading={loading}
            source={source}
            error={error}
            quota={quota}
            updatedAt={updatedAt}
            onRefresh={refresh}
            onSelect={setSelected}
            watchlist={watchlist}
            toggleWatch={toggleWatch}
          />
        )}
      </div>
    </div>
  );
}
