import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchLiveOdds } from "./services/liveOdds.js";
import { bestOddsForOutcome, findArbitrage } from "./engine/recommendations.js";

const C = {
  bg: "#050810",
  surface: "#0d1117",
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
};

const css = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; background: ${C.bg}; color: ${C.text}; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  button, input { font: inherit; }
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
      background: "rgba(255,255,255,0.045)",
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
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

const OddsGrid = ({ market }) => (
  <div style={{ display: "grid", gap: 8 }}>
    {market.outcomes.map((outcome) => {
      const best = bestOddsForOutcome(outcome);
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
            <div style={{ color: C.muted, fontSize: 11 }}>{best.bookmakerName || best.bookmaker}</div>
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

const MatchCard = ({ match, onSelect }) => {
  const h2h = match.markets.find((market) => market.type === "1x2") || match.markets[0];
  const arb = h2h ? findArbitrage(h2h) : null;

  return (
    <Card onClick={() => onSelect(match)} style={{
      marginBottom: 10,
      borderColor: arb?.isArb ? `${C.green}66` : C.border,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 5 }}>
            {match.tournament} · {fmtTime(match.startsAt)}
          </div>
          <div style={{ fontWeight: 900, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {match.homeTeam} vs {match.awayTeam}
          </div>
        </div>
        {arb?.isArb && <Badge color={C.green} bg={C.greenDim}>ARB {pct(arb.margin)}</Badge>}
        {!arb?.isArb && arb?.isNearArb && <Badge color={C.amber} bg={C.amberDim}>Nær arb</Badge>}
      </div>
      {h2h && <OddsGrid market={h2h} />}
    </Card>
  );
};

const Dashboard = ({ matches, loading, source, error, quota, updatedAt, onRefresh, onSelect }) => {
  const arbs = useMemo(() => matches.flatMap((match) => match.markets
    .map((market) => ({ match, arb: findArbitrage(market) }))
    .filter((item) => item.arb?.isArb)), [matches]);

  return (
    <div>
      <StatusPanel loading={loading} source={source} error={error} quota={quota} updatedAt={updatedAt} matchCount={matches.length} />

      <Section title="Live oversikt" right={<button onClick={onRefresh} style={buttonStyle}>Oppdater</button>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          <Card><Metric label="Kamper" value={matches.length} /></Card>
          <Card><Metric label="Arb" value={arbs.length} color={arbs.length ? C.green : C.text} /></Card>
          <Card><Metric label="Kilde" value="API" color={C.accent} /></Card>
        </div>
      </Section>

      <Section title="Arbitrasje fra ekte odds">
        {arbs.length ? arbs.slice(0, 6).map(({ match, arb }) => (
          <Card key={`${match.id}-${arb.marketId}`} style={{ marginBottom: 10, borderColor: `${C.green}66` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 850 }}>{match.homeTeam} vs {match.awayTeam}</div>
                <div style={{ color: C.muted, fontSize: 12 }}>{arb.marketLabel}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.green, fontWeight: 900 }}>+NOK {arb.profit}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>per 1000</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {arb.legs.map((leg) => (
                <div key={leg.outcomeId} style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 12 }}>
                  <span>{leg.outcomeLabel} · {leg.bookmaker}</span>
                  <span style={{ color: C.text }}>{leg.odds.toFixed(2)} · NOK {leg.stake}</span>
                </div>
              ))}
            </div>
          </Card>
        )) : (
          <EmptyState
            title="Ingen arbitrasje akkurat nå"
            text="Dette er normalt. Appen viser kun muligheter som faktisk finnes i live odds-dataene."
          />
        )}
      </Section>

      <Section title="Kamper">
        {matches.length ? matches.map((match) => <MatchCard key={match.id} match={match} onSelect={onSelect} />) : (
          <EmptyState
            title="Ingen kamper fra API"
            text="Når The Odds API returnerer VM-kamper, vises de her. Ingen demo-kamper legges inn."
          />
        )}
      </Section>
    </div>
  );
};

const Metric = ({ label, value, color = C.text }) => (
  <div>
    <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>{label}</div>
    <div style={{ color, fontWeight: 900, fontSize: 22 }}>{value}</div>
  </div>
);

const MatchDetail = ({ match, onBack }) => {
  const arbs = match.markets.map((market) => findArbitrage(market)).filter(Boolean);
  return (
    <div>
      <button onClick={onBack} style={{ ...buttonStyle, marginBottom: 14 }}>Tilbake</button>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>{match.tournament} · {fmtTime(match.startsAt)}</div>
        <div style={{ fontSize: 22, fontWeight: 950 }}>{match.homeTeam}</div>
        <div style={{ color: C.muted, margin: "3px 0" }}>vs</div>
        <div style={{ fontSize: 22, fontWeight: 950 }}>{match.awayTeam}</div>
      </Card>

      <Section title="Markeder og beste odds">
        {match.markets.map((market) => (
          <Card key={market.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 850 }}>{market.label}</div>
              {arbs.find((arb) => arb.marketId === market.id)?.isArb && <Badge color={C.green} bg={C.greenDim}>ARB</Badge>}
            </div>
            <OddsGrid market={market} />
          </Card>
        ))}
      </Section>
    </div>
  );
};

const Account = ({ source, quota }) => (
  <div>
    <Section title="Bruker">
      <Card style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Min side</div>
        <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55 }}>
          Dette er en ren brukerside uten fiktiv bet-historikk. Ekte innlogging, lagrede bets og portefølje krever en database/auth-løsning som Supabase, Clerk eller Firebase.
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
  </div>
);

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

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("loading");
  const [error, setError] = useState(null);
  const [quota, setQuota] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

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

  const nav = [
    { id: "dashboard", label: "Odds" },
    { id: "account", label: "Min side" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <style>{css}</style>
      <div style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "18px 14px 80px",
      }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: "-.03em" }}>OddsArb Pro</div>
            <div style={{ color: C.muted, fontSize: 12 }}>Kun live odds. Ingen mock bets. Ingen fiktiv statistikk.</div>
          </div>
          {loading && <Spinner />}
        </header>

        <nav style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          borderBottom: `1px solid ${C.border}`,
          paddingBottom: 10,
        }}>
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
          <MatchDetail match={selected} onBack={() => setSelected(null)} />
        ) : tab === "account" ? (
          <Account source={source} quota={quota} />
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
          />
        )}
      </div>
    </div>
  );
}
