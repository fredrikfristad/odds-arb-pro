import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchLiveOdds } from "./services/liveOdds.js";
import { bestOddsForOutcome, findArbitrage } from "./engine/recommendations.js";
import { calculateArbitrageOpportunities } from "./engine/arbitrage.js";
import { calculateValueBets } from "./engine/valueBetEngine.js";
import { bookmakerUrl } from "./config/bookmakers.js";
import { generateParlays, PARLAY_TYPE_OPTIONS } from "./parlay/parlayGenerator.js";
import { isUpcomingPlayableMatch } from "./parlay/valueEngine.js";

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
  .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .wc-filter-grid { display: grid; grid-template-columns: 1.4fr repeat(4, minmax(120px, auto)); gap: 8px; margin-bottom: 12px; }
  @media (max-width: 760px) {
    .metric-grid { grid-template-columns: repeat(2, 1fr); }
    .wc-filter-grid { grid-template-columns: 1fr; }
  }
`;

const fmtTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Ukjent tid";
  return date.toLocaleString("no-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const pct = (n) => `${(n * 100).toFixed(2)}%`;
const money = (n) => `NOK ${Math.round(n).toLocaleString("no-NO")}`;
const fmtDateKey = (iso) => new Date(iso).toISOString().slice(0, 10);
const fmtUpdated = (iso) => {
  if (!iso) return "Ukjent";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Ukjent";
  return date.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
};

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

const ValueBadge = ({ tag }) => {
  const palette = {
    elite: [C.purple, C.purpleDim],
    value: [C.green, C.greenDim],
    overpriced: [C.amber, C.amberDim],
    arbitrage: [C.accent, C.accentDim],
    fair: [C.muted, C.surfaceUp],
  };
  const [color, bg] = palette[tag?.type] || palette.fair;
  return <Badge color={color} bg={bg}>{tag?.label || "Fair"}</Badge>;
};

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

const isWorldCupMatch = (match) => {
  const haystack = `${match.tournament || ""} ${match.round || ""} ${match.group || ""}`.toLowerCase();
  return haystack.includes("world cup")
    || haystack.includes("fifa")
    || haystack.includes("vm 2026")
    || haystack.includes("soccer_fifa_world_cup");
};

const statusLabel = (match) => {
  if (match.status === "live") return "Live";
  if (match.status === "finished") return "Ferdig";
  return "Kommende";
};

const phaseLabel = (match) => {
  if (match.round && match.round !== "Live odds") return match.round;
  if (match.group) return `Gruppe ${match.group}`;
  return "VM 2026";
};

const marketOptionsForMatches = (matches) => [...new Map(matches
  .flatMap((match) => match.markets)
  .map((market) => [market.type, market.label])).entries()]
  .map(([type, label]) => ({ type, label }));

const groupWorldCupMatches = (matches) => {
  const todayKey = fmtDateKey(new Date().toISOString());
  const buckets = new Map();

  for (const match of matches) {
    const key = match.status === "live"
      ? "Live nå"
      : fmtDateKey(match.startsAt) === todayKey
        ? "Dagens kamper"
        : "Kommende kamper";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(match);
  }

  return [...buckets.entries()].map(([title, items]) => ({
    title,
    items: items.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)),
  }));
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

const InlineMetric = ({ label, value, color = C.text }) => (
  <div style={{
    background: C.surfaceUp,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "9px 10px",
    minWidth: 0,
  }}>
    <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>{label}</div>
    <div style={{ color, fontWeight: 900, fontSize: 16 }}>{value}</div>
  </div>
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
  width: "100%",
  background: C.surfaceUp,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  padding: "9px 10px",
  outline: "none",
};

const clampNumber = (value, min, max) => {
  let next = value;
  if (typeof min === "number") next = Math.max(min, next);
  if (typeof max === "number") next = Math.min(max, next);
  return next;
};

const NumericInput = ({ value, onCommit, min, max, step = "any", label, help, integer = false }) => {
  const [draft, setDraft] = useState(String(value ?? ""));

  useEffect(() => {
    setDraft(String(value ?? ""));
  }, [value]);

  const commit = () => {
    if (draft === "" || draft === "." || draft === "0." || draft === "1.") {
      setDraft(String(value ?? ""));
      return;
    }

    const parsed = Number(draft.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setDraft(String(value ?? ""));
      return;
    }

    const normalized = integer ? Math.round(parsed) : parsed;
    const clamped = clampNumber(normalized, min, max);
    onCommit(clamped);
    setDraft(String(clamped));
  };

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      {label && <span style={{ color: C.text, fontSize: 12, fontWeight: 800 }}>{label}</span>}
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          if (/^\d*([.,]\d*)?$/.test(next)) setDraft(next);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        step={step}
        style={{ ...selectStyle, display: "block", minWidth: 0, height: 46 }}
      />
      {help && <span style={{ color: C.muted, fontSize: 11, lineHeight: 1.35 }}>{help}</span>}
    </div>
  );
};

const SelectField = ({ label, help, children, ...props }) => (
  <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
    {label && <span style={{ color: C.text, fontSize: 12, fontWeight: 800 }}>{label}</span>}
    <select {...props} style={{ ...selectStyle, display: "block", minWidth: 0, height: 46, ...(props.style || {}) }}>
      {children}
    </select>
    {help && <span style={{ color: C.muted, fontSize: 11, lineHeight: 1.35 }}>{help}</span>}
  </div>
);

const SettingHint = ({ title, children }) => (
  <div style={{
    background: "rgba(255,255,255,0.035)",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "9px 10px",
    color: C.muted,
    fontSize: 12,
    lineHeight: 1.45,
  }}>
    <strong style={{ color: C.text }}>{title}: </strong>{children}
  </div>
);

const ControlTile = ({ children }) => (
  <div style={{
    background: "rgba(255,255,255,0.025)",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 12,
    minWidth: 0,
  }}>
    {children}
  </div>
);

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

const BookmakerLink = ({ odd, children, style = {} }) => {
  const url = bookmakerUrl(odd.bookmakerKey || odd.bookmaker, odd.bookmakerUrl);
  if (!url) {
    return (
      <span style={{ ...style, color: C.muted }} title="Ingen bookmaker-URL tilgjengelig">
        {children}
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...style, color: "inherit", textDecoration: "none" }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
};

const WorldCupOddsRows = ({ market, bookmakerFilter }) => {
  const rows = market.outcomes.flatMap((outcome) => {
    const validOdds = outcome.odds
      .filter((odd) => Number.isFinite(odd.decimalOdds) && odd.decimalOdds > 1)
      .filter((odd) => bookmakerFilter === "all" || (odd.bookmakerName || odd.bookmaker) === bookmakerFilter);
    const bestPrice = Math.max(...validOdds.map((odd) => odd.decimalOdds), 0);
    return validOdds.map((odd) => ({
      outcome,
      odd,
      isBest: odd.decimalOdds === bestPrice && bestPrice > 0,
    }));
  });

  if (!rows.length) {
    return (
      <div style={{ color: C.muted, fontSize: 12, padding: "10px 0" }}>
        Ingen odds tilgjengelig for valgt bookmaker/marked.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 7 }}>
      {rows.sort((a, b) => b.odd.decimalOdds - a.odd.decimalOdds).map(({ outcome, odd, isBest }) => (
        <BookmakerLink
          key={`${outcome.id}-${odd.bookmaker}-${odd.decimalOdds}`}
          odd={odd}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            alignItems: "center",
            background: isBest ? C.greenDim : C.surfaceUp,
            border: `1px solid ${isBest ? `${C.green}66` : C.border}`,
            borderRadius: 8,
            padding: "9px 10px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13 }}>{outcome.label}</strong>
              {isBest && <Badge color={C.green} bg={C.greenDim}>Beste odds</Badge>}
            </div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
              {odd.bookmakerName || odd.bookmaker} · oppdatert {fmtUpdated(odd.fetchedAt)}
            </div>
          </div>
          <div style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            color: isBest ? C.green : C.accent,
            fontWeight: 950,
            fontSize: 18,
          }}>
            {odd.decimalOdds.toFixed(2)}
          </div>
        </BookmakerLink>
      ))}
    </div>
  );
};

const ArbitrageOpportunityCard = ({ opportunity }) => (
  <Card style={{
    marginBottom: 10,
    borderColor: opportunity.profitMarginPct >= 2 ? `${C.green}88` : `${C.green}55`,
    background: "rgba(48,209,88,0.06)",
  }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 12 }}>
      <div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          <Badge color={C.green} bg={C.greenDim}>Arbitrasje</Badge>
          <Badge color={C.green} bg={C.greenDim}>+{opportunity.profitMarginPct.toFixed(2)}%</Badge>
          {opportunity.status === "live" && <Badge color={C.red} bg={C.redDim}>Live</Badge>}
          {opportunity.profitMarginPct >= 2 && <Badge color={C.amber} bg={C.amberDim}>Høy margin</Badge>}
        </div>
        <div style={{ fontWeight: 950, fontSize: 16 }}>
          {opportunity.match.homeTeam} vs {opportunity.match.awayTeam}
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
          {opportunity.marketLabel} · sum {opportunity.arbitrageSum.toFixed(4)} · {fmtTime(opportunity.startsAt)}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: C.green, fontWeight: 950, fontSize: 18 }}>
          +{money(opportunity.guaranteedProfit)}
        </div>
        <div style={{ color: C.muted, fontSize: 11 }}>ved {money(opportunity.totalStake)}</div>
      </div>
    </div>

    <div style={{ display: "grid", gap: 8 }}>
      {opportunity.legs.map((leg) => {
        const tied = leg.tiedBookmakers.length > 1
          ? ` · delt beste med ${leg.tiedBookmakers.length} bookmakere`
          : "";
        return (
          <div key={leg.outcomeId} style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            alignItems: "center",
            background: C.surfaceUp,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "10px 12px",
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 850, fontSize: 13 }}>{leg.outcomeLabel}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>
                {leg.bookmaker} @ {leg.odds.toFixed(2)}{tied}
              </div>
              <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>
                Innsats {money(leg.stake)} · payout {money(leg.expectedPayout)}
              </div>
            </div>
            <BookmakerLink odd={leg} style={{
              ...buttonStyle,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              minWidth: 112,
              color: C.accent,
            }}>
              Gå til {leg.bookmaker}
            </BookmakerLink>
          </div>
        );
      })}
    </div>
  </Card>
);

const WorldCupArbitrageSection = ({ matches, books, marketOptions }) => {
  const [stake, setStake] = useState(1000);
  const [minMargin, setMinMargin] = useState(0);
  const [bookmakerFilter, setBookmakerFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const opportunities = useMemo(() => calculateArbitrageOpportunities(matches, { totalStake: stake }), [matches, stake]);
  const filtered = useMemo(() => opportunities.filter((opportunity) => {
    const marginMatch = opportunity.profitMarginPct >= minMargin;
    const bookmakerMatch = bookmakerFilter === "all" || opportunity.legs.some((leg) => leg.bookmaker === bookmakerFilter);
    const marketMatch = marketFilter === "all" || opportunity.marketType === marketFilter;
    const statusMatch = statusFilter === "all" || opportunity.status === statusFilter;
    return marginMatch && bookmakerMatch && marketMatch && statusMatch;
  }), [bookmakerFilter, marketFilter, minMargin, opportunities, statusFilter]);

  return (
    <Section title="Arbitrasjemuligheter" right={<Badge color={filtered.length ? C.green : C.muted} bg={filtered.length ? C.greenDim : C.surfaceUp}>{filtered.length} funnet</Badge>}>
      <Card style={{ marginBottom: 10 }}>
        <div className="wc-filter-grid">
          <NumericInput
            value={stake}
            onCommit={setStake}
            min={10}
            label="Total innsats"
            help="Beløpet fordeles slik at mulig payout blir mest mulig likt."
          />
          <SelectField
            value={minMargin}
            onChange={(event) => setMinMargin(Number(event.target.value))}
            label="Minimum margin"
            help="Viser bare arbitrasjer over valgt profittmargin før gebyrer og odds-endringer."
          >
            <option value={0}>Alle marginer</option>
            <option value={0.5}>Min +0.5%</option>
            <option value={1}>Min +1%</option>
            <option value={2}>Min +2%</option>
          </SelectField>
          <SelectField
            value={bookmakerFilter}
            onChange={(event) => setBookmakerFilter(event.target.value)}
            label="Bookmaker"
            help="Filtrer muligheter som bruker valgt bookmaker."
          >
            <option value="all">Alle bookmakere</option>
            {books.map((book) => <option key={book.name} value={book.name}>{book.name}</option>)}
          </SelectField>
          <SelectField
            value={marketFilter}
            onChange={(event) => setMarketFilter(event.target.value)}
            label="Marked"
            help="Begrenser søket til én markedstype."
          >
            <option value="all">Alle markeder</option>
            {marketOptions.map((market) => <option key={market.type} value={market.type}>{market.label}</option>)}
          </SelectField>
          <SelectField
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            label="Status"
            help="Velg om du vil se live eller kun prematch-muligheter."
          >
            <option value="all">Live og prematch</option>
            <option value="live">Live</option>
            <option value="upcoming">Prematch</option>
          </SelectField>
        </div>
        <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.45 }}>
          Total innsats brukes til å fordele stake slik at forventet payout blir likest mulig på alle utfall.
        </div>
      </Card>

      {filtered.length ? filtered.map((opportunity) => (
        <ArbitrageOpportunityCard key={opportunity.id} opportunity={opportunity} />
      )) : (
        <EmptyState
          title="Ingen arbitrasjemuligheter funnet akkurat nå."
          text="Når summen av 1 / beste odds per utfall er under 1.00, vises muligheten her automatisk."
        />
      )}
    </Section>
  );
};

const MatchCard = ({ match, onSelect, watchlist, toggleWatch }) => {
  const h2h = match.markets.find((market) => market.type === "1x2") || match.markets[0];
  const arb = h2h ? findArbitrage(h2h) : null;
  const bestValue = useMemo(() => calculateValueBets([match], { minValueEdge: -100 })[0], [match]);
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
          {bestValue && bestValue.tag.type !== "fair" && <ValueBadge tag={bestValue.tag} />}
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

const WorldCupMatchCard = ({ match, onSelect, marketFilter, bookmakerFilter }) => {
  const markets = match.markets.filter((market) => marketFilter === "all" || market.type === marketFilter);
  const live = match.status === "live";
  const bookCount = getBookmakers([match]).length;

  return (
    <Card style={{
      marginBottom: 10,
      borderColor: live ? `${C.red}66` : C.border,
      background: live ? "rgba(255,69,58,0.055)" : C.glass,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 12 }}>
        <div onClick={() => onSelect(match)} style={{ cursor: "pointer", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
            <Badge color={live ? C.red : C.accent} bg={live ? C.redDim : C.accentDim}>{statusLabel(match)}</Badge>
            <Badge color={C.amber} bg={C.amberDim}>{phaseLabel(match)}</Badge>
            <span style={{ color: C.muted, fontSize: 11 }}>{bookCount} bookmakere</span>
          </div>
          <div style={{ fontWeight: 950, fontSize: 17, lineHeight: 1.25 }}>
            {match.homeTeam} vs {match.awayTeam}
          </div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
            {fmtTime(match.startsAt)} · {match.markets.length} markeder
          </div>
        </div>
        <button onClick={() => onSelect(match)} style={{ ...buttonStyle, alignSelf: "start" }}>Detaljer</button>
      </div>

      {markets.length ? markets.slice(0, 3).map((market) => (
        <div key={market.id} style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
            <strong style={{ fontSize: 13 }}>{market.label}</strong>
            <span style={{ color: C.muted, fontSize: 11 }}>{market.outcomes.length} utfall</span>
          </div>
          <WorldCupOddsRows market={market} bookmakerFilter={bookmakerFilter} />
        </div>
      )) : (
        <div style={{ color: C.muted, fontSize: 12 }}>Ingen markeder matcher valgt filter.</div>
      )}
    </Card>
  );
};

const WorldCupScreen = ({ matches, loading, source, error, quota, updatedAt, onRefresh, onSelect }) => {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookmakerFilter, setBookmakerFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");

  const worldCupMatches = useMemo(() => matches.filter(isWorldCupMatch), [matches]);
  const books = useMemo(() => getBookmakers(worldCupMatches), [worldCupMatches]);
  const marketOptions = useMemo(() => marketOptionsForMatches(worldCupMatches), [worldCupMatches]);
  const dates = useMemo(() => [...new Set(worldCupMatches.map((match) => fmtDateKey(match.startsAt)))].sort(), [worldCupMatches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return worldCupMatches.filter((match) => {
      const queryMatch = !q || `${match.homeTeam} ${match.awayTeam} ${match.tournament} ${match.round} ${match.group}`.toLowerCase().includes(q);
      const dateMatch = dateFilter === "all" || fmtDateKey(match.startsAt) === dateFilter;
      const statusMatch = statusFilter === "all" || match.status === statusFilter;
      const marketMatch = marketFilter === "all" || match.markets.some((market) => market.type === marketFilter);
      const bookmakerMatch = bookmakerFilter === "all" || match.markets.some((market) => market.outcomes.some((outcome) => outcome.odds.some((odd) => (odd.bookmakerName || odd.bookmaker) === bookmakerFilter)));
      return queryMatch && dateMatch && statusMatch && marketMatch && bookmakerMatch;
    }).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  }, [bookmakerFilter, dateFilter, marketFilter, search, statusFilter, worldCupMatches]);

  const grouped = useMemo(() => groupWorldCupMatches(filtered), [filtered]);
  const arbs = useMemo(() => flattenArbs(worldCupMatches), [worldCupMatches]);

  return (
    <div>
      <Card style={{
        marginBottom: 16,
        background: "linear-gradient(135deg, rgba(10,132,255,0.16), rgba(48,209,88,0.08))",
        borderColor: `${C.accent}55`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: "0 0 6px", fontSize: 30, letterSpacing: "-.04em" }}>VM 2026</h1>
            <p style={{ margin: 0, color: C.muted, fontSize: 14, lineHeight: 1.55 }}>
              Sammenlign odds på VM 2026-kamper fra flere bookmakere og gå direkte til beste tilgjengelige odds.
            </p>
          </div>
          {loading && <Spinner />}
        </div>
      </Card>

      <StatusPanel loading={loading} source={source} error={error} quota={quota} updatedAt={updatedAt} matchCount={worldCupMatches.length} />

      <Section title="VM oversikt" right={<button onClick={onRefresh} style={buttonStyle}>Oppdater</button>}>
        <div className="metric-grid">
          <Metric label="VM-kamper" value={worldCupMatches.length} />
          <Metric label="Live" value={worldCupMatches.filter((match) => match.status === "live").length} color={C.red} />
          <Metric label="Bookmakere" value={books.length} color={C.accent} />
          <Metric label="Arb/nær" value={arbs.length} color={arbs.length ? C.green : C.text} />
        </div>
      </Section>

      <WorldCupArbitrageSection
        matches={worldCupMatches}
        books={books}
        marketOptions={marketOptions}
      />

      <Section title="Filtrer VM-kamper">
        <div className="wc-filter-grid">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Søk lag, land eller fase"
            style={{ ...selectStyle, minWidth: 0 }}
          />
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} style={selectStyle}>
            <option value="all">Alle datoer</option>
            {dates.map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={selectStyle}>
            <option value="all">Alle status</option>
            <option value="live">Live</option>
            <option value="upcoming">Kommende</option>
            <option value="finished">Ferdig</option>
          </select>
          <select value={bookmakerFilter} onChange={(event) => setBookmakerFilter(event.target.value)} style={selectStyle}>
            <option value="all">Alle bookmakere</option>
            {books.map((book) => <option key={book.name} value={book.name}>{book.name}</option>)}
          </select>
          <select value={marketFilter} onChange={(event) => setMarketFilter(event.target.value)} style={selectStyle}>
            <option value="all">Alle markeder</option>
            {marketOptions.map((market) => <option key={market.type} value={market.type}>{market.label}</option>)}
          </select>
        </div>
      </Section>

      {error && !loading && !worldCupMatches.length && (
        <Section title="Feil">
          <EmptyState title="Kunne ikke hente VM-data" text={error} />
        </Section>
      )}

      {grouped.length ? grouped.map((group) => (
        <Section key={group.title} title={`${group.title} (${group.items.length})`}>
          {group.items.map((match) => (
            <WorldCupMatchCard
              key={match.id}
              match={match}
              onSelect={onSelect}
              marketFilter={marketFilter}
              bookmakerFilter={bookmakerFilter}
            />
          ))}
        </Section>
      )) : (
        <EmptyState
          title="Ingen VM 2026-kamper funnet"
          text="API-et returnerte ingen kamper som matcher FIFA World Cup/VM 2026-filteret. Sjekk ODDS_SPORTS, API-kvote eller filtervalg."
        />
      )}
    </div>
  );
};

const Dashboard = ({ matches, loading, source, error, quota, updatedAt, onRefresh, onSelect, watchlist, toggleWatch }) => {
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState("all");
  const [sort, setSort] = useState("time");

  const arbs = useMemo(() => flattenArbs(matches), [matches]);
  const books = useMemo(() => getBookmakers(matches), [matches]);
  const valueBets = useMemo(() => calculateValueBets(matches, { minValueEdge: 8, minConfidence: 0.45 }), [matches]);

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
        <div className="metric-grid">
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

      <Section title="Beste Value Bets">
        {valueBets.length ? valueBets.slice(0, 3).map((bet) => (
          <ValueBetCard key={bet.id} bet={bet} compact />
        )) : (
          <EmptyState
            title="Ingen tydelige value bets akkurat nå"
            text="Når modellens fair odds er lavere enn bookmakerens odds, vises de beste avvikene her."
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

const ValueBetCard = ({ bet, compact = false }) => (
  <Card style={{
    marginBottom: 10,
    borderColor: bet.tag.type === "elite" ? `${C.purple}66` : bet.tag.type === "value" ? `${C.green}66` : bet.tag.type === "overpriced" ? `${C.amber}66` : C.border,
  }}>
    <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr auto" : "1fr auto", gap: 12, alignItems: "start" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
          <ValueBadge tag={bet.tag} />
          {bet.isArbitrage && <Badge color={C.accent} bg={C.accentDim}>⚡ Arbitrage</Badge>}
          <Badge color={bet.confidenceLabel === "High" ? C.green : bet.confidenceLabel === "Medium" ? C.amber : C.muted} bg={C.surfaceUp}>
            Confidence {(bet.confidence * 100).toFixed(0)}%
          </Badge>
          <Badge color={bet.dataQualityLabel === "High" ? C.green : bet.dataQualityLabel === "Medium" ? C.amber : C.muted} bg={C.surfaceUp}>
            Data {bet.dataQualityLabel}
          </Badge>
        </div>
        <div style={{ fontWeight: 950, fontSize: compact ? 14 : 17 }}>{bet.matchLabel}</div>
        <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
          {fmtTime(bet.startsAt)} · {bet.marketLabel} · {bet.outcomeLabel} · {bet.bookmaker}
        </div>
      </div>
      <div style={{ textAlign: "right", minWidth: 118 }}>
        <div style={{ color: bet.valueEdge >= 0 ? C.green : C.amber, fontWeight: 950, fontSize: compact ? 16 : 20 }}>
          {bet.valueEdge >= 0 ? "+" : ""}{bet.valueEdge.toFixed(0)}%
        </div>
        <div style={{ color: C.muted, fontSize: 11 }}>value edge</div>
      </div>
    </div>

    {!compact && (
      <>
        <div className="metric-grid" style={{ marginTop: 12 }}>
          <InlineMetric label="Bookmaker odds" value={bet.bookmakerOdds.toFixed(2)} color={C.text} />
          <InlineMetric label="Model fair odds" value={bet.fairOdds.toFixed(2)} color={C.accent} />
          <InlineMetric label="Bookmaker prob." value={`${(bet.impliedProbability * 100).toFixed(1)}%`} />
          <InlineMetric label="Model prob." value={`${(bet.modelProbability * 100).toFixed(1)}%`} color={C.green} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 12, alignItems: "center" }}>
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{bet.reason}</div>
          <BookmakerLink odd={{ bookmakerUrl: bet.bookmakerUrl, bookmakerKey: bet.bookmakerKey, bookmaker: bet.bookmaker }} style={{ ...buttonStyle, whiteSpace: "nowrap" }}>
            Gå til {bet.bookmaker}
          </BookmakerLink>
        </div>
      </>
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
          <NumericInput
            value={stake}
            onCommit={setStake}
            min={10}
            label="Stake"
            help="Beløpet du ønsker å fordele på arbitrasje-beina. Verdien valideres først når du forlater feltet."
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

const ValueScreen = ({ matches }) => {
  const [minEdge, setMinEdge] = useState(8);
  const [minConfidence, setMinConfidence] = useState(45);
  const [bookmakerFilter, setBookmakerFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [sportFilter, setSportFilter] = useState("all");
  const books = useMemo(() => getBookmakers(matches), [matches]);
  const marketOptions = useMemo(() => marketOptionsForMatches(matches), [matches]);
  const sports = useMemo(() => [...new Set(matches.map((match) => match.tournament).filter(Boolean))].sort(), [matches]);
  const scopedMatches = useMemo(() => sportFilter === "all"
    ? matches
    : matches.filter((match) => match.tournament === sportFilter), [matches, sportFilter]);
  const valueBets = useMemo(() => calculateValueBets(scopedMatches, {
    minValueEdge: minEdge,
    minConfidence: minConfidence / 100,
    bookmaker: bookmakerFilter,
    marketType: marketFilter,
  }), [bookmakerFilter, marketFilter, minConfidence, minEdge, scopedMatches]);

  const eliteCount = valueBets.filter((bet) => bet.tag.type === "elite").length;
  const overpricedCount = useMemo(() => calculateValueBets(scopedMatches, {
    minValueEdge: -100,
    minConfidence: minConfidence / 100,
    bookmaker: bookmakerFilter,
    marketType: marketFilter,
  }).filter((bet) => bet.tag.type === "overpriced").length, [bookmakerFilter, marketFilter, minConfidence, scopedMatches]);

  return (
    <div>
      <Card style={{
        marginBottom: 16,
        background: "linear-gradient(135deg, rgba(48,209,88,0.12), rgba(10,132,255,0.08))",
        borderColor: `${C.green}55`,
      }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 28, letterSpacing: "-.04em" }}>Value Betting Engine</h1>
        <p style={{ margin: 0, color: C.muted, lineHeight: 1.55, fontSize: 14 }}>
          Finner odds der modellert sannsynlighet avviker fra bookmakerens pris. Fair odds beregnes som 1 / modellert sannsynlighet.
        </p>
      </Card>

      <Section title="Value-filtre">
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
            <ControlTile>
              <NumericInput
                value={minEdge}
                onCommit={setMinEdge}
                min={-100}
                label="Minimum value edge (%)"
                help="Bookmaker odds / fair odds minus 1. Høyere tall betyr større avvik mot modellen."
              />
            </ControlTile>
            <ControlTile>
              <NumericInput
                value={minConfidence}
                onCommit={setMinConfidence}
                min={0}
                max={100}
                integer
                label="Minimum confidence (%)"
                help="Bygger på datamengde, ferskhet, stabilitet og modellkonsistens."
              />
            </ControlTile>
            <ControlTile>
              <SelectField
                value={bookmakerFilter}
                onChange={(event) => setBookmakerFilter(event.target.value)}
                label="Bookmaker"
                help="Vis kun value hos valgt bookmaker."
              >
                <option value="all">Alle bookmakere</option>
                {books.map((book) => <option key={book.name} value={book.name}>{book.name}</option>)}
              </SelectField>
            </ControlTile>
            <ControlTile>
              <SelectField
                value={marketFilter}
                onChange={(event) => setMarketFilter(event.target.value)}
                label="Markedstype"
                help="Filtrer på 1X2, over/under, handicap eller andre markeder i feeden."
              >
                <option value="all">Alle markeder</option>
                {marketOptions.map((market) => <option key={market.type} value={market.type}>{market.label}</option>)}
              </SelectField>
            </ControlTile>
            <ControlTile>
              <SelectField
                value={sportFilter}
                onChange={(event) => setSportFilter(event.target.value)}
                label="Sport/turnering"
                help="Filtrer på sport eller turnering slik den kommer fra oddsfeed."
              >
                <option value="all">Alle sporter</option>
                {sports.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
              </SelectField>
            </ControlTile>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <Badge color={C.green} bg={C.greenDim}>{valueBets.length} value bets</Badge>
            <Badge color={C.purple} bg={C.purpleDim}>{eliteCount} elite</Badge>
            <Badge color={C.amber} bg={C.amberDim}>{overpricedCount} overpriced</Badge>
          </div>
        </Card>
      </Section>

      <Section title="Beste Value Bets">
        {valueBets.length ? valueBets.slice(0, 20).map((bet) => (
          <ValueBetCard key={bet.id} bet={bet} />
        )) : (
          <EmptyState
            title="Ingen value bets matcher filtrene"
            text="Senk minimum edge eller confidence, eller velg alle bookmakere og markeder."
          />
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

const ParlayCard = ({ parlay }) => {
  const [explain, setExplain] = useState(false);
  return (
    <Card style={{
      marginBottom: 12,
      borderColor: parlay.score.riskLabel === "High" ? `${C.red}66` : parlay.score.riskLabel === "Medium" ? `${C.amber}66` : `${C.green}66`,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            <Badge color={C.accent} bg={C.accentDim}>{parlay.type}</Badge>
            <Badge color={parlay.score.riskLabel === "High" ? C.red : parlay.score.riskLabel === "Medium" ? C.amber : C.green}
              bg={parlay.score.riskLabel === "High" ? C.redDim : parlay.score.riskLabel === "Medium" ? C.amberDim : C.greenDim}>
              {parlay.score.riskLabel} risk
            </Badge>
            {parlay.relaxed && <Badge color={C.amber} bg={C.amberDim}>Nærmeste forslag</Badge>}
            {parlay.legs.some((leg) => leg.isWorldCup2026) && <Badge color={C.amber} bg={C.amberDim}>VM 2026</Badge>}
          </div>
          <div style={{ fontSize: 18, fontWeight: 950 }}>Total odds {parlay.score.totalOdds.toFixed(2)}</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
            Score {parlay.score.parlayScore.toFixed(0)}/100 · Treffrate {(parlay.score.hitProbability * 100).toFixed(1)}% · EV {(parlay.score.expectedValue * 100).toFixed(1)}%
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: C.green, fontWeight: 950 }}>{money(parlay.simulation.expectedReturn)}</div>
          <div style={{ color: C.muted, fontSize: 11 }}>sim. snitt / 100 NOK</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {parlay.legs.map((leg) => (
          <div key={leg.id} style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            background: C.surfaceUp,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "10px 12px",
            alignItems: "center",
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
                {leg.expectedValue >= 1 ? (
                  <Badge color={C.purple} bg={C.purpleDim}>🔥 Elite Value</Badge>
                ) : leg.expectedValue > 0 ? (
                  <Badge color={C.green} bg={C.greenDim}>💎 Value Bet</Badge>
                ) : (
                  <Badge color={C.amber} bg={C.amberDim}>⚠️ Overpriced</Badge>
                )}
              </div>
              <div style={{ fontWeight: 850, fontSize: 13 }}>{leg.matchLabel}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                {leg.marketLabel} · {leg.outcomeLabel} · {leg.bookmaker}
              </div>
              <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>
                Kampstart {fmtTime(leg.matchDate)} · {statusLabel({ status: leg.matchStatus })} · Modell {(leg.modelProbability * 100).toFixed(1)}% · implied {(leg.impliedProbability * 100).toFixed(1)}% · EV {(leg.expectedValue * 100).toFixed(1)}%
              </div>
            </div>
            <div style={{ display: "grid", gap: 7, justifyItems: "end" }}>
              <div style={{
                color: C.green,
                background: C.greenDim,
                border: `1px solid ${C.green}55`,
                borderRadius: 8,
                padding: "6px 9px",
                fontWeight: 950,
                whiteSpace: "nowrap",
              }}>
                Odds {leg.odds.toFixed(2)}
              </div>
              <BookmakerLink odd={leg} style={{ ...buttonStyle, minWidth: 118, textAlign: "center" }}>
                Open Betslip
              </BookmakerLink>
            </div>
          </div>
        ))}
      </div>

      {parlay.score.correlationRisk > 0.25 && (
        <div style={{ marginTop: 10, color: C.amber, background: C.amberDim, border: `1px solid ${C.amber}44`, borderRadius: 8, padding: 10, fontSize: 12 }}>
          Varsel: Denne parlayen har forhøyet korrelasjonsrisiko ({(parlay.score.correlationRisk * 100).toFixed(1)}%).
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={() => setExplain((value) => !value)} style={buttonStyle}>Explain This Parlay</button>
        <Badge color={C.purple} bg={C.purpleDim}>Monte Carlo {parlay.simulation.iterations} runs</Badge>
        <Badge color={C.muted} bg={C.surfaceUp}>Loss {(parlay.simulation.lossProbability * 100).toFixed(1)}%</Badge>
        <Badge color={C.muted} bg={C.surfaceUp}>Drawdown {money(Math.abs(parlay.simulation.maxDrawdown))}</Badge>
      </div>

      {explain && (
        <div style={{ marginTop: 10, color: C.muted, lineHeight: 1.55, fontSize: 13 }}>
          {parlay.explanation}
        </div>
      )}
    </Card>
  );
};

const ParlayGeneratorScreen = ({ matches }) => {
  const [settings, setSettings] = useState({
    parlayType: "aiValue",
    legCount: 3,
    minTotalOdds: 2,
    maxTotalOdds: 150,
    targetTotalOdds: 10,
    riskLevel: "Medium",
    worldCupOnly: false,
    valueOnly: true,
    excludeSameGame: true,
    maxLegsPerMatch: 1,
    maxCorrelationRisk: 0.35,
  });
  const [nonce, setNonce] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const upcomingMatches = useMemo(() => matches.filter((match) => isUpcomingPlayableMatch(match)), [matches]);
  const hasOddsData = useMemo(() => matches.some((match) => match.markets?.some((market) => market.outcomes?.some((outcome) => outcome.odds?.length))), [matches]);
  const parlays = useMemo(() => generateParlays(matches, { ...settings, seedOffset: nonce }), [matches, settings, nonce]);
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const applyRiskPreset = (preset) => setSettings((current) => ({
    ...current,
    ...preset,
    maxTotalOdds: Math.max(preset.maxTotalOdds || current.maxTotalOdds, preset.targetTotalOdds || current.targetTotalOdds),
  }));

  return (
    <div>
      <Card style={{
        marginBottom: 16,
        background: "linear-gradient(135deg, rgba(191,90,242,0.14), rgba(10,132,255,0.08))",
        borderColor: `${C.purple}55`,
      }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 28, letterSpacing: "-.04em" }}>Parlay Generator</h1>
        <p style={{ margin: 0, color: C.muted, lineHeight: 1.55, fontSize: 14 }}>
          AI-drevet modul som vurderer single bets først, filtrerer på positiv EV, kontrollerer korrelasjon og simulerer realistiske parleys basert på live odds og modellklare historikkfelter.
        </p>
      </Card>

      <Section title="Generator-innstillinger">
        <Card>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {[
              ["Trygg 5", { riskLevel: "Low", legCount: 3, minTotalOdds: 2, targetTotalOdds: 5, maxTotalOdds: 8, valueOnly: true, excludeSameGame: true, maxCorrelationRisk: 0.2 }],
              ["Balansert 20", { riskLevel: "Medium", legCount: 4, minTotalOdds: 8, targetTotalOdds: 20, maxTotalOdds: 35, valueOnly: true, excludeSameGame: true, maxCorrelationRisk: 0.35 }],
              ["Høy odds 100", { riskLevel: "High", legCount: 5, minTotalOdds: 50, targetTotalOdds: 100, maxTotalOdds: 180, valueOnly: false, excludeSameGame: false, maxLegsPerMatch: 2, maxCorrelationRisk: 0.55 }],
            ].map(([label, preset]) => (
              <button key={label} onClick={() => applyRiskPreset(preset)} style={{
                ...buttonStyle,
                background: label.includes("100") ? C.redDim : label.includes("20") ? C.amberDim : C.greenDim,
                color: label.includes("100") ? C.red : label.includes("20") ? C.amber : C.green,
                borderColor: label.includes("100") ? `${C.red}66` : label.includes("20") ? `${C.amber}66` : `${C.green}66`,
              }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
            alignItems: "start",
            marginTop: 12,
          }}>
            <ControlTile>
              <SelectField
                value={settings.riskLevel}
                onChange={(event) => update("riskLevel", event.target.value)}
                label="Risiko"
                help="Velg hvor offensiv parlayen skal være."
              >
                <option value="Low">Lav</option>
                <option value="Medium">Medium</option>
                <option value="High">Høy</option>
              </SelectField>
            </ControlTile>
            <ControlTile>
              <NumericInput
                value={settings.targetTotalOdds}
                onCommit={(value) => {
                  setSettings((current) => ({
                    ...current,
                    targetTotalOdds: value,
                    maxTotalOdds: Math.max(current.maxTotalOdds, value * 1.8),
                  }));
                }}
                min={1}
                label="Ønsket totalodds"
                help="Sett for eksempel 100. Appen viser nærmeste forslag hvis den ikke treffer perfekt."
              />
            </ControlTile>
            <ControlTile>
              <NumericInput
                value={settings.legCount}
                onCommit={(value) => update("legCount", value)}
                min={2}
                max={8}
                integer
                label="Antall legs"
                help="Færre legs gir oftere forslag. Flere legs gir høyere risiko."
              />
            </ControlTile>
          </div>

          <button onClick={() => setShowAdvanced((value) => !value)} style={{ ...buttonStyle, marginTop: 12, background: "transparent", color: C.muted, borderColor: C.border }}>
            {showAdvanced ? "Skjul avanserte filtre" : "Vis avanserte filtre"}
          </button>

          {showAdvanced && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 10,
              alignItems: "start",
              marginTop: 12,
            }}>
              <ControlTile>
                <SelectField value={settings.parlayType} onChange={(event) => update("parlayType", event.target.value)} label="Parlay-type" help="AI Value er standard. Bytt bare hvis du vil styre strategi manuelt.">
                  {PARLAY_TYPE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </SelectField>
              </ControlTile>
              <ControlTile>
                <NumericInput value={settings.minTotalOdds} onCommit={(value) => update("minTotalOdds", value)} min={1} label="Min odds" help="Hard nedre grense. Hold lav hvis du vil unngå tomme resultater." />
              </ControlTile>
              <ControlTile>
                <NumericInput value={settings.maxTotalOdds} onCommit={(value) => update("maxTotalOdds", value)} min={1} label="Max odds" help="Hard øvre grense. Øk denne hvis du vil ha høyere odds." />
              </ControlTile>
              <ControlTile>
                <SelectField value={settings.maxCorrelationRisk} onChange={(event) => update("maxCorrelationRisk", Number(event.target.value))} label="Korrelasjon" help="Høy gjør det lettere å finne forslag, men øker risiko.">
                  <option value={0.2}>Lav</option>
                  <option value={0.35}>Medium</option>
                  <option value={0.55}>Høy</option>
                </SelectField>
              </ControlTile>
              {[
                ["worldCupOnly", "Kun VM 2026"],
                ["valueOnly", "Kun value bets"],
                ["excludeSameGame", "Ekskluder same-game"],
              ].map(([key, label]) => (
                <ControlTile key={key}>
                  <button onClick={() => update(key, !settings[key])} style={{
                    ...buttonStyle,
                    width: "100%",
                    minHeight: 46,
                    background: settings[key] ? C.greenDim : "transparent",
                    color: settings[key] ? C.green : C.muted,
                    borderColor: settings[key] ? `${C.green}66` : C.border,
                  }}>
                    {label}
                  </button>
                </ControlTile>
              ))}
              <ControlTile>
                <SelectField value={settings.maxLegsPerMatch} onChange={(event) => update("maxLegsPerMatch", Number(event.target.value))} label="Legs per kamp" help="Øk hvis du vil ha flere forslag fra færre kamper.">
                  <option value={1}>Maks 1</option>
                  <option value={2}>Maks 2</option>
                  <option value={4}>Maks 4</option>
                </SelectField>
              </ControlTile>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <SettingHint title="Enkelt forklart">Velg preset eller skriv ønsket totalodds. Generatoren prøver først perfekte treff, og viser deretter nærmeste forslag hvis filtrene blir for strenge.</SettingHint>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <Badge color={upcomingMatches.length ? C.green : C.amber} bg={upcomingMatches.length ? C.greenDim : C.amberDim}>
              Kommende kamper: {upcomingMatches.length}
            </Badge>
            {!hasOddsData && <Badge color={C.amber} bg={C.amberDim}>Oddsdata mangler for noen kamper.</Badge>}
          </div>
        </Card>
      </Section>

      <Section title="Genererte parlays" right={<button onClick={() => setNonce((value) => value + 1)} style={buttonStyle}>Generate New Parlay</button>}>
        {!upcomingMatches.length ? (
          <EmptyState
            title="Ingen kommende kamper funnet."
            text="Generatoren bruker kun kamper som ikke har startet. Live, ferdige, utsatte og kansellerte kamper filtreres bort."
          />
        ) : parlays.length ? parlays.slice(0, 5).map((parlay) => (
          <ParlayCard key={parlay.id} parlay={parlay} />
        )) : (
          <EmptyState
            title="Ingen parleys funnet"
            text="Ingen spill matcher valgte innstillinger. Prøv å øke max totalodds, redusere antall legs, slå av Kun value bets, eller velg Høy odds 100-presettet."
          />
        )}
      </Section>
    </div>
  );
};

export default function App() {
  const [tab, setTab] = useState(() => window.location.pathname === "/world-cup-2026" ? "worldCup" : "dashboard");
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
  }, [refresh]);

  const toggleWatch = (matchId) => {
    setWatchlist((current) => current.includes(matchId)
      ? current.filter((id) => id !== matchId)
      : [...current, matchId]);
  };

  const nav = [
    { id: "dashboard", label: "Odds" },
    { id: "worldCup", label: "VM 2026", path: "/world-cup-2026" },
    { id: "value", label: "Value" },
    { id: "arbitrage", label: "Arb" },
    { id: "parlay", label: "Parlay" },
    { id: "books", label: "Books" },
    { id: "account", label: "Min side" },
  ];

  const navigateTab = (item) => {
    setTab(item.id);
    setSelected(null);
    const path = item.path || "/";
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  };

  useEffect(() => {
    const onPopState = () => {
      setTab(window.location.pathname === "/world-cup-2026" ? "worldCup" : "dashboard");
      setSelected(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
            <button key={item.id} onClick={() => navigateTab(item)} style={{
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
        ) : tab === "worldCup" ? (
          <WorldCupScreen
            matches={matches}
            loading={loading}
            source={source}
            error={error}
            quota={quota}
            updatedAt={updatedAt}
            onRefresh={refresh}
            onSelect={setSelected}
          />
        ) : tab === "value" ? (
          <ValueScreen matches={matches} />
        ) : tab === "arbitrage" ? (
          <ArbitrageScreen matches={matches} />
        ) : tab === "parlay" ? (
          <ParlayGeneratorScreen matches={matches} />
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
