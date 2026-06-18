import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { fetchLiveOdds } from "./services/liveOdds.js";
import { recommendMatches } from "./engine/recommendations.js";

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — Apple Liquid Glass inspired dark theme
// ═══════════════════════════════════════════════════════════════════════════════
const C = {
  bg: "#050810", surface: "#0d1117", glass: "rgba(255,255,255,0.04)",
  glassBorder: "rgba(255,255,255,0.08)", surfaceUp: "#161d2b", border: "#1a2540",
  accent: "#0a84ff", accentDim: "rgba(10,132,255,0.15)",
  green: "#30d158", greenDim: "rgba(48,209,88,0.15)",
  red: "#ff453a",   redDim: "rgba(255,69,58,0.15)",
  amber: "#ffd60a", amberDim: "rgba(255,214,10,0.15)",
  purple: "#bf5af2",purpleDim: "rgba(191,90,242,0.15)",
  cyan: "#64d2ff",  cyanDim: "rgba(100,210,255,0.15)",
  tp: "#f2f2f7", ts: "#8e8e93", tm: "#3a3a4a",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: ${C.bg}; color: ${C.tp}; font-family: 'Inter', -apple-system, sans-serif;
    -webkit-tap-highlight-color: transparent; overscroll-behavior: none;
  }
  input, button, select, textarea { font-family: inherit; }
  input[type=range] { accent-color: ${C.accent}; width: 100%; cursor: pointer; }
  ::-webkit-scrollbar { width: 2px; height: 2px; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }

  @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  @keyframes fadeIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes glow    { 0%,100%{box-shadow:0 0 8px rgba(48,209,88,0.3)} 50%{box-shadow:0 0 20px rgba(48,209,88,0.7)} }
  @keyframes ticker  { from{transform:translateX(0)} to{transform:translateX(-50%)} }
  @keyframes flash   { 0%,100%{background:transparent} 40%{background:rgba(255,214,10,0.12)} }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const BOOKS = {
  pinnacle:    { name:"Pinnacle",     color:"#e8c84a", tier:"sharp" },
  betfair:     { name:"Betfair Exch", color:"#f5a623", tier:"exchange" },
  bet365:      { name:"Bet365",       color:"#027b5b", tier:"soft" },
  unibet:      { name:"Unibet",       color:"#00a651", tier:"soft" },
  coolbet:     { name:"Coolbet",      color:"#ff6b00", tier:"soft" },
  stake:       { name:"Stake",        color:"#1a9270", tier:"soft" },
  betsson:     { name:"Betsson",      color:"#c0392b", tier:"soft" },
  nordicbet:   { name:"NordicBet",    color:"#3498db", tier:"soft" },
  williamhill: { name:"William Hill", color:"#004e9f", tier:"soft" },
  polymarket:  { name:"Polymarket",   color:"#0066ff", tier:"prediction" },
  draftkings:  { name:"DraftKings",   color:"#53d338", tier:"us" },
};

const NAV = {
  ONBOARD:"onboard", DASHBOARD:"dash", WC:"wc", PROPS:"props",
  ARB:"arb", COPILOT:"ai", PORTFOLIO:"port",
  EV:"ev", PLAYER_DETAIL:"player_detail", MOVERS:"movers", SETTINGS:"settings",
};

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
const T = Date.now();
const ff = h => new Date(T + h*3600000).toISOString();
const fa = h => new Date(T - h*3600000).toISOString();

// Randomize for realism
const rng = (min,max,dec=2) => +(Math.random()*(max-min)+min).toFixed(dec);
const mkOdds = (bk, odds, mAgo=2) => ({
  bookmaker:bk, decimalOdds:odds,
  fetchedAt: new Date(T - mAgo*60000).toISOString(),
  isMock:true,
});

const WC_MATCHES = [
  {
    id:"wc-live1", tournament:"FIFA World Cup 2026", round:"Group Stage", group:"D",
    homeTeam:"Portugal", awayTeam:"Netherlands", he:"🇵🇹", ae:"🇳🇱",
    startsAt:fa(1.3), status:"live", liveMinute:74, score:{home:1,away:1},
    xg:{home:1.42,away:0.87}, possession:{home:58,away:42},
    markets:[
      { id:"ml-1x2", type:"1x2", label:"Kampresultat", outcomes:[
        { id:"home", label:"Portugal", odds:[
          mkOdds("pinnacle",2.72,0),mkOdds("bet365",2.80,1),mkOdds("unibet",2.75,0),
          mkOdds("coolbet",2.82,2),mkOdds("stake",2.78,0),mkOdds("betfair",2.76,1),
        ]},
        { id:"draw", label:"Uavgjort", odds:[
          mkOdds("pinnacle",2.55,0),mkOdds("bet365",2.60,1),mkOdds("unibet",2.58,0),
          mkOdds("coolbet",2.55,2),mkOdds("stake",2.62,0),mkOdds("betfair",2.50,1),
        ]},
        { id:"away", label:"Nederland", odds:[
          mkOdds("pinnacle",2.48,0),mkOdds("bet365",2.55,1),mkOdds("unibet",2.50,0),
          mkOdds("coolbet",2.52,2),mkOdds("stake",2.45,0),mkOdds("betfair",2.54,1),
        ]},
      ]},
      { id:"ml-ou", type:"over_under", label:"Over/Under 2.5", outcomes:[
        { id:"over",  label:"Over 2.5",  odds:[mkOdds("pinnacle",1.35,0),mkOdds("bet365",1.38,1),mkOdds("unibet",1.36,0)]},
        { id:"under", label:"Under 2.5", odds:[mkOdds("pinnacle",3.10,0),mkOdds("bet365",3.00,1),mkOdds("unibet",3.05,0)]},
      ]},
      { id:"ml-btts", type:"btts", label:"Begge lag scorer", outcomes:[
        { id:"yes", label:"Ja",  odds:[mkOdds("pinnacle",1.28,0),mkOdds("bet365",1.30,1),mkOdds("unibet",1.29,0)]},
        { id:"no",  label:"Nei", odds:[mkOdds("pinnacle",3.50,0),mkOdds("bet365",3.40,1),mkOdds("unibet",3.45,0)]},
      ]},
    ],
  },
  {
    id:"wc-001", tournament:"FIFA World Cup 2026", round:"Group Stage", group:"A",
    homeTeam:"Brazil", awayTeam:"Germany", he:"🇧🇷", ae:"🇩🇪",
    startsAt:ff(2), status:"upcoming",
    markets:[
      { id:"m1-1x2", type:"1x2", label:"Kampresultat", outcomes:[
        { id:"home", label:"Brasil",   odds:[mkOdds("pinnacle",2.08,1),mkOdds("bet365",2.15,3),mkOdds("unibet",2.10,2),mkOdds("coolbet",2.18,4),mkOdds("stake",2.12,1),mkOdds("polymarket",2.05,2),mkOdds("betfair",2.14,1)]},
        { id:"draw", label:"Uavgjort", odds:[mkOdds("pinnacle",3.42,1),mkOdds("bet365",3.50,3),mkOdds("unibet",3.45,2),mkOdds("coolbet",3.55,4),mkOdds("stake",3.48,1),mkOdds("polymarket",3.60,2),mkOdds("betfair",3.52,1)]},
        { id:"away", label:"Tyskland",  odds:[mkOdds("pinnacle",3.18,1),mkOdds("bet365",3.30,3),mkOdds("unibet",3.20,2),mkOdds("coolbet",3.35,4),mkOdds("stake",3.25,1),mkOdds("polymarket",3.40,2),mkOdds("betfair",3.22,1)]},
      ]},
      { id:"m1-ou", type:"over_under", label:"Over/Under 2.5", outcomes:[
        { id:"over",  label:"Over 2.5",  odds:[mkOdds("pinnacle",1.85,1),mkOdds("bet365",1.90,3),mkOdds("unibet",1.87,2)]},
        { id:"under", label:"Under 2.5", odds:[mkOdds("pinnacle",1.97,1),mkOdds("bet365",1.90,3),mkOdds("unibet",1.94,2)]},
      ]},
      { id:"m1-btts", type:"btts", label:"Begge lag scorer", outcomes:[
        { id:"yes", label:"Ja",  odds:[mkOdds("pinnacle",1.72,1),mkOdds("bet365",1.78,3),mkOdds("unibet",1.75,2)]},
        { id:"no",  label:"Nei", odds:[mkOdds("pinnacle",2.07,1),mkOdds("bet365",2.00,3),mkOdds("unibet",2.04,2)]},
      ]},
    ],
  },
  {
    id:"wc-002", tournament:"FIFA World Cup 2026", round:"Group Stage", group:"B",
    homeTeam:"Argentina", awayTeam:"France", he:"🇦🇷", ae:"🇫🇷",
    startsAt:ff(5), status:"upcoming",
    markets:[
      { id:"m2-1x2", type:"1x2", label:"Kampresultat", outcomes:[
        { id:"home", label:"Argentina", odds:[mkOdds("pinnacle",2.28,2),mkOdds("bet365",2.35,4),mkOdds("unibet",2.30,1),mkOdds("coolbet",2.40,3),mkOdds("stake",2.32,2),mkOdds("betfair",2.26,1)]},
        { id:"draw", label:"Uavgjort",  odds:[mkOdds("pinnacle",3.18,2),mkOdds("bet365",3.25,4),mkOdds("unibet",3.20,1),mkOdds("coolbet",3.30,3),mkOdds("stake",3.22,2),mkOdds("betfair",3.15,1)]},
        { id:"away", label:"Frankrike", odds:[mkOdds("pinnacle",2.78,2),mkOdds("bet365",2.90,4),mkOdds("unibet",2.80,1),mkOdds("coolbet",2.95,3),mkOdds("stake",2.82,2),mkOdds("betfair",2.76,1)]},
      ]},
      { id:"m2-ou", type:"over_under", label:"Over/Under 2.5", outcomes:[
        { id:"over",  label:"Over 2.5",  odds:[mkOdds("pinnacle",1.78,2),mkOdds("bet365",1.83,4),mkOdds("unibet",1.80,1)]},
        { id:"under", label:"Under 2.5", odds:[mkOdds("pinnacle",2.05,2),mkOdds("bet365",2.00,4),mkOdds("unibet",2.02,1)]},
      ]},
    ],
  },
  {
    id:"wc-003", tournament:"FIFA World Cup 2026", round:"Group Stage", group:"C",
    homeTeam:"England", awayTeam:"Spain", he:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", ae:"🇪🇸",
    startsAt:ff(26), status:"upcoming",
    markets:[
      { id:"m3-1x2", type:"1x2", label:"Kampresultat", outcomes:[
        { id:"home", label:"England", odds:[mkOdds("pinnacle",2.48,5),mkOdds("bet365",2.55,3),mkOdds("unibet",2.50,6),mkOdds("coolbet",2.52,4),mkOdds("betfair",2.46,2)]},
        { id:"draw", label:"Uavgjort",odds:[mkOdds("pinnacle",3.28,5),mkOdds("bet365",3.25,3),mkOdds("unibet",3.30,6),mkOdds("coolbet",3.32,4),mkOdds("betfair",3.24,2)]},
        { id:"away", label:"Spania",  odds:[mkOdds("pinnacle",2.58,5),mkOdds("bet365",2.65,3),mkOdds("unibet",2.60,6),mkOdds("coolbet",2.62,4),mkOdds("betfair",2.56,2)]},
      ]},
    ],
  },
  {
    id:"wc-fin1", tournament:"FIFA World Cup 2026", round:"Group Stage", group:"A",
    homeTeam:"USA", awayTeam:"Mexico", he:"🇺🇸", ae:"🇲🇽",
    startsAt:fa(3), status:"finished", score:{home:2,away:1},
    markets:[
      { id:"mf-1x2", type:"1x2", label:"Kampresultat", outcomes:[
        { id:"home", label:"USA",     odds:[mkOdds("pinnacle",2.18,180)]},
        { id:"draw", label:"Uavgjort",odds:[mkOdds("pinnacle",3.10,180)]},
        { id:"away", label:"Mexico",  odds:[mkOdds("pinnacle",3.40,180)]},
      ]},
    ],
  },
];

// Player Props data
const PLAYER_PROPS = [
  {
    id:"pp1", player:"Erling Haaland", team:"Man City", teamFlag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    position:"ST", avatar:"🇳🇴", nationality:"Norway",
    marketValue:"€180M", seasonRating:9.1, appearances:30,
    seasonGoals:32, seasonAssists:5, seasonXG:28.4,
    market:"Anytime Scorer", line:null,
    bookOdds:2.10, modelProb:0.58, fairOdds:1.72,
    ev:0.22, confidence:8.9, rec:"BET",
    form:[1,0,1,1,0,1,0,1,1,0],
    stats:{ goals5:4, shots5:14, sot5:9, xg5:3.8, goalsPerGame:0.72, yellowCards:2 },
    recentForm:[
      {match:"vs Arsenal",     goals:2, assists:0, shots:5, xG:2.1, rating:9.2},
      {match:"vs Barcelona",   goals:1, assists:1, shots:4, xG:1.4, rating:8.5},
      {match:"vs Liverpool",   goals:0, assists:1, shots:3, xG:0.8, rating:7.1},
      {match:"vs Chelsea",     goals:3, assists:0, shots:7, xG:2.8, rating:9.8},
      {match:"vs Real Madrid", goals:1, assists:0, shots:4, xG:1.2, rating:8.0},
    ],
    props:[
      {market:"Anytime Scorer",  bookOdds:2.10, modelProb:0.58, fairOdds:1.72, ev:0.221, confidence:8.9, rec:"BET"},
      {market:"2+ Goals",        bookOdds:4.50, modelProb:0.29, fairOdds:3.45, ev:0.304, confidence:7.8, rec:"BET"},
      {market:"Shot on Target",  bookOdds:1.55, modelProb:0.72, fairOdds:1.39, ev:0.115, confidence:9.1, rec:"BET"},
      {market:"Yellow Card",     bookOdds:6.00, modelProb:0.08, fairOdds:12.5, ev:-0.52, confidence:8.2, rec:"PASS"},
    ],
  },
  {
    id:"pp2", player:"Kylian Mbappé", team:"Real Madrid", teamFlag:"🇪🇸",
    position:"ST", avatar:"🇫🇷", nationality:"France",
    marketValue:"€220M", seasonRating:9.3, appearances:29,
    seasonGoals:28, seasonAssists:9, seasonXG:22.1,
    market:"Anytime Scorer", line:null,
    bookOdds:1.95, modelProb:0.56, fairOdds:1.79,
    ev:0.09, confidence:7.2, rec:"BET",
    form:[1,1,0,1,0,0,1,1,0,1],
    stats:{ goals5:3, shots5:12, sot5:7, xg5:3.1, goalsPerGame:0.68, yellowCards:3 },
    recentForm:[
      {match:"vs Atletico",  goals:1, assists:2, shots:4, xG:1.1, rating:9.0},
      {match:"vs PSG",       goals:2, assists:0, shots:5, xG:1.8, rating:9.4},
      {match:"vs Barcelona", goals:1, assists:1, shots:3, xG:0.9, rating:8.8},
      {match:"vs Dortmund",  goals:0, assists:2, shots:2, xG:0.6, rating:8.2},
      {match:"vs Juventus",  goals:1, assists:0, shots:4, xG:1.3, rating:8.6},
    ],
    props:[
      {market:"Anytime Scorer", bookOdds:1.95, modelProb:0.56, fairOdds:1.79, ev:0.092, confidence:7.2, rec:"BET"},
      {market:"Assist",         bookOdds:3.20, modelProb:0.38, fairOdds:2.63, ev:0.216, confidence:7.5, rec:"BET"},
      {market:"Shot on Target", bookOdds:1.50, modelProb:0.74, fairOdds:1.35, ev:0.110, confidence:9.2, rec:"BET"},
    ],
  },
  {
    id:"pp3", player:"Vinicius Jr", team:"Real Madrid", teamFlag:"🇪🇸",
    position:"LW", avatar:"🇧🇷", nationality:"Brazil",
    marketValue:"€200M", seasonRating:8.9, appearances:28,
    seasonGoals:22, seasonAssists:14, seasonXG:18.2,
    market:"Anytime Scorer", line:null,
    bookOdds:2.40, modelProb:0.47, fairOdds:2.13,
    ev:0.13, confidence:6.8, rec:"BET",
    form:[0,1,0,1,1,0,0,1,0,1],
    stats:{ goals5:3, shots5:11, sot5:6, xg5:2.4, goalsPerGame:0.55, yellowCards:5 },
    recentForm:[
      {match:"vs Atletico",  goals:0, assists:2, shots:3, xG:0.7, rating:8.5},
      {match:"vs PSG",       goals:2, assists:1, shots:5, xG:1.9, rating:9.6},
      {match:"vs Barcelona", goals:1, assists:0, shots:4, xG:1.2, rating:8.3},
      {match:"vs Dortmund",  goals:1, assists:1, shots:3, xG:0.8, rating:8.9},
      {match:"vs Juventus",  goals:0, assists:2, shots:2, xG:0.5, rating:8.1},
    ],
    props:[
      {market:"Anytime Scorer", bookOdds:2.40, modelProb:0.47, fairOdds:2.13, ev:0.128, confidence:6.8, rec:"BET"},
      {market:"Yellow Card",    bookOdds:3.50, modelProb:0.22, fairOdds:4.55, ev:-0.23, confidence:8.0, rec:"PASS"},
    ],
  },
  {
    id:"pp4", player:"Lionel Messi", team:"Inter Miami", teamFlag:"🇺🇸",
    position:"CAM", avatar:"🇦🇷", nationality:"Argentina",
    marketValue:"€25M", seasonRating:8.4, appearances:22,
    seasonGoals:18, seasonAssists:20, seasonXG:14.5,
    market:"Assists", line:"0.5",
    bookOdds:2.20, modelProb:0.52, fairOdds:1.92,
    ev:0.15, confidence:7.5, rec:"BET",
    form:[1,0,1,0,1,1,0,1,0,1],
    stats:{ goals5:2, shots5:8, sot5:5, xg5:1.8, goalsPerGame:0.48, yellowCards:1 },
    recentForm:[
      {match:"vs LA Galaxy",   goals:1, assists:2, shots:4, xG:1.1, rating:9.1},
      {match:"vs NY City",     goals:0, assists:2, shots:3, xG:0.8, rating:8.4},
      {match:"vs Columbus",    goals:2, assists:1, shots:5, xG:1.7, rating:9.3},
      {match:"vs Atlanta",     goals:0, assists:1, shots:2, xG:0.6, rating:7.8},
      {match:"vs Toronto",     goals:1, assists:0, shots:4, xG:1.0, rating:8.2},
    ],
    props:[
      {market:"Assist",          bookOdds:2.20, modelProb:0.52, fairOdds:1.92, ev:0.144, confidence:7.5, rec:"BET"},
      {market:"Anytime Scorer",  bookOdds:3.00, modelProb:0.41, fairOdds:2.44, ev:0.230, confidence:7.1, rec:"BET"},
    ],
  },
  {
    id:"pp5", player:"Cristiano Ronaldo", team:"Al Nassr", teamFlag:"🇸🇦",
    position:"ST", avatar:"🇵🇹", nationality:"Portugal",
    marketValue:"€15M", seasonRating:7.8, appearances:25,
    seasonGoals:21, seasonAssists:5, seasonXG:17.2,
    market:"Anytime Scorer", line:null,
    bookOdds:2.80, modelProb:0.38, fairOdds:2.63,
    ev:-0.05, confidence:4.2, rec:"PASS",
    form:[0,1,0,0,1,0,1,0,0,1],
    stats:{ goals5:2, shots5:9, sot5:4, xg5:1.9, goalsPerGame:0.44, yellowCards:2 },
    recentForm:[
      {match:"vs Al-Hilal",    goals:1, assists:0, shots:4, xG:1.1, rating:8.0},
      {match:"vs Al-Ittihad",  goals:0, assists:1, shots:3, xG:0.7, rating:7.4},
      {match:"vs Al-Ahli",     goals:2, assists:0, shots:5, xG:1.8, rating:8.8},
      {match:"vs Al-Shabab",   goals:0, assists:0, shots:2, xG:0.5, rating:6.9},
      {match:"vs Al-Qadsiah",  goals:1, assists:0, shots:4, xG:1.2, rating:7.8},
    ],
    props:[
      {market:"Anytime Scorer", bookOdds:2.80, modelProb:0.38, fairOdds:2.63, ev:-0.052, confidence:4.2, rec:"PASS"},
    ],
  },
  {
    id:"pp6", player:"Harry Kane", team:"Bayern Munich", teamFlag:"🇩🇪",
    position:"ST", avatar:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality:"England",
    marketValue:"€100M", seasonRating:8.8, appearances:28,
    seasonGoals:26, seasonAssists:8, seasonXG:23.1,
    market:"Over 1.5 Shots on Target", line:"1.5",
    bookOdds:1.85, modelProb:0.64, fairOdds:1.56,
    ev:0.19, confidence:8.1, rec:"BET",
    form:[1,1,0,1,1,0,1,1,1,0],
    stats:{ goals5:4, shots5:16, sot5:10, xg5:4.2, goalsPerGame:0.78, yellowCards:1 },
    recentForm:[
      {match:"vs Dortmund",   goals:2, assists:0, shots:6, xG:2.1, rating:9.1},
      {match:"vs Leverkusen", goals:1, assists:1, shots:5, xG:1.5, rating:8.6},
      {match:"vs Stuttgart",  goals:0, assists:2, shots:4, xG:1.1, rating:7.8},
      {match:"vs Freiburg",   goals:2, assists:0, shots:6, xG:2.0, rating:9.0},
      {match:"vs Augsburg",   goals:1, assists:0, shots:5, xG:1.4, rating:8.3},
    ],
    props:[
      {market:"Over 1.5 SoT",   bookOdds:1.85, modelProb:0.64, fairOdds:1.56, ev:0.184, confidence:8.1, rec:"BET"},
      {market:"Anytime Scorer",  bookOdds:2.00, modelProb:0.58, fairOdds:1.72, ev:0.160, confidence:8.3, rec:"BET"},
      {market:"2+ Goals",        bookOdds:4.20, modelProb:0.30, fairOdds:3.33, ev:0.260, confidence:7.2, rec:"BET"},
    ],
  },
];

// Top ARB opportunities
const ARB_OPS = [
  {
    id:"arb1", market:"Arsenal vs Chelsea — Match Result",
    legs:[
      { outcome:"Arsenal", book:"Pinnacle",    odds:2.18, impliedProb:0.459 },
      { outcome:"Draw",    book:"Betfair",     odds:3.60, impliedProb:0.278 },
      { outcome:"Chelsea", book:"Coolbet",     odds:4.80, impliedProb:0.208 },
    ],
    totalIP:0.945, margin:0.055, profit:5.82, stakeBase:1000,
    timestamp: fa(0.05),
  },
  {
    id:"arb2", market:"Man City vs Liverpool — Over/Under",
    legs:[
      { outcome:"Over 2.5", book:"Bet365",  odds:1.92, impliedProb:0.521 },
      { outcome:"Under 2.5",book:"Pinnacle",odds:2.10, impliedProb:0.476 },
    ],
    totalIP:0.997, margin:0.003, profit:0.30, stakeBase:1000,
    timestamp: fa(0.02),
  },
  {
    id:"arb3", market:"Brazil vs Germany — Match Result (VM)",
    legs:[
      { outcome:"Brasil",   book:"Coolbet",  odds:2.18, impliedProb:0.459 },
      { outcome:"Uavgjort", book:"Polymarket",odds:3.60,impliedProb:0.278 },
      { outcome:"Tyskland", book:"Betfair",  odds:3.40, impliedProb:0.294 },
    ],
    totalIP:1.031, margin:-0.031, profit:null, stakeBase:1000,
    timestamp: fa(0.1),
    nearArb: true,
  },
  {
    id:"arb4", market:"Champions League Winner — Cross Market",
    legs:[
      { outcome:"Real Madrid", book:"Betfair",  odds:3.20, impliedProb:0.313 },
      { outcome:"NOT R.Madrid",book:"Polymarket",odds:1.42,impliedProb:0.704 },
    ],
    totalIP:1.017, margin:-0.017, profit:null, stakeBase:1000,
    nearArb: true, timestamp: fa(0.08),
  },
];

// Market movers
const MOVERS = [
  { match:"Brasil vs Tyskland", market:"Brasil Win", from:2.30, to:2.08, dir:"down", book:"Pinnacle", reason:"Smart money" },
  { match:"Argentina vs Frankrike", market:"Over 2.5", from:1.95, to:1.78, dir:"down", book:"Pinnacle", reason:"Line move" },
  { match:"Portugal vs Nederland", market:"Portugal Win", from:3.10, to:2.72, dir:"down", book:"Betfair", reason:"Live goal" },
  { match:"England vs Spania", market:"Spania Win", from:2.75, to:2.58, dir:"down", book:"Pinnacle", reason:"Injury news" },
  { match:"Brasil vs Tyskland", market:"Harry Kane Cards", from:2.80, to:2.20, dir:"down", book:"Bet365", reason:"Yellow alarm" },
];

// Portfolio
const PORTFOLIO = {
  totalBankroll: 10000,
  atRisk: 1840,
  openBets: [
    { id:"b1", match:"Brasil vs Tyskland", bet:"Brasil Win", stake:250, odds:2.10, ev:0.12, status:"open", potential:525 },
    { id:"b2", match:"Argentina vs Frankrike", bet:"Over 2.5", stake:180, odds:1.78, ev:0.09, status:"open", potential:320 },
    { id:"b3", match:"Haaland Anytime", bet:"Scorer", stake:150, odds:2.10, ev:0.22, status:"won", potential:315, result:315 },
    { id:"b4", match:"Portugal vs Nederland", bet:"Over 2.5", stake:200, odds:1.35, ev:0.08, status:"open", potential:270 },
    { id:"b5", match:"Kane SoT 1.5+", bet:"Over", stake:160, odds:1.85, ev:0.19, status:"open", potential:296 },
  ],
  history: { totalBets:142, wonBets:89, roi:0.142, clv:0.067, totalProfit:2840 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE SIMULATION
// ═══════════════════════════════════════════════════════════════════════════════
const jitter = (b,p=0.012) => Math.max(1.01, Math.round((b+b*p*(Math.random()*2-1))*100)/100);
const simulateLive = ms => ms.map(m => ({
  ...m,
  liveMinute: m.status==="live" ? Math.min(90,(m.liveMinute||60)+Math.floor(Math.random()*1.5)) : m.liveMinute,
  markets: m.markets.map(mkt => ({
    ...mkt,
    outcomes: mkt.outcomes.map(oc => ({
      ...oc,
      odds: oc.odds.map(od => ({
        ...od,
        decimalOdds: m.status==="live" ? jitter(od.decimalOdds) : od.decimalOdds,
        fetchedAt: new Date().toISOString(),
      })),
    })),
  })),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// CALCULATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
const r2 = n => Math.round(n*100)/100;
const r4 = n => Math.round(n*10000)/10000;

// Best odds per outcome across all books
const bestOdds = outcomes => outcomes.reduce((acc,oc) => {
  const best = oc.odds.reduce((b,o) => o.decimalOdds>b.decimalOdds?o:b, oc.odds[0]);
  acc[oc.id] = { ...best, label:oc.label, impliedProb:1/best.decimalOdds };
  return acc;
}, {});

const calcArb = (bestMap, stake=1000) => {
  const legs = Object.values(bestMap);
  const tip  = r4(legs.reduce((s,l)=>s+l.impliedProb,0));
  const isArb = tip < 1.0;
  const calcLegs = legs.map(l => {
    const s = r2((stake * l.impliedProb) / tip);
    return { ...l, stake:s, potReturn:r2(s*l.decimalOdds) };
  });
  return { isArb, isNearArb:!isArb&&tip<1.04, tip, margin:r4(1-tip),
    legs:calcLegs, stake, gRet:r2(stake/tip), gProfit:r2(stake/tip-stake) };
};

const calcHedge = (origStake, origOdds, hedgeOdd) => {
  const origRet = r2(origStake*origOdds);
  const hStake  = r2(origRet/hedgeOdd.decimalOdds);
  const hRet    = r2(hStake*hedgeOdd.decimalOdds);
  const total   = r2(origStake+hStake);
  return { origStake, origOdds, origRet, hStake, hRet, total,
    worstCase:r2(Math.min(origRet,hRet)-total),
    bestCase: r2(Math.max(origRet,hRet)-total),
    scenarios:[
      { label:"Original vinner", net:r2(origRet-total) },
      { label:"Hedge vinner",    net:r2(hRet-total) },
    ], hedgeOdd };
};

// Kelly Criterion
const kelly = (prob, odds, fraction=0.25) => {
  const b = odds - 1;
  const q = 1 - prob;
  const k = (b*prob - q) / b;
  return Math.max(0, r4(k * fraction));
};

// EV calculation
const calcEV = (modelProb, decOdds) => r4(modelProb*decOdds - 1);

// Build hedge suggestions
const buildSuggestions = (selBet, allMarkets, stake) => {
  const suggestions = [];
  for (const mkt of allMarkets) {
    const bMap = bestOdds(mkt.outcomes);
    if (Object.keys(bMap).length >= 2) {
      const arb = calcArb(bMap, stake);
      if (arb.isArb || arb.isNearArb) {
        suggestions.push({ kind:"full_arb", arb, mkt, label:arb.isArb?"ARB":"NEAR ARB",
          isArb:arb.isArb, sortScore:arb.isArb?-1:0 });
      }
    }
    const hedgeOuts = mkt.outcomes.filter(oc=>oc.id!==selBet?.outcomeId);
    for (const oc of hedgeOuts) {
      if (!oc.odds.length) continue;
      const bestO = oc.odds.reduce((b,o)=>o.decimalOdds>b.decimalOdds?o:b, oc.odds[0]);
      const hedge = calcHedge(stake, selBet?.decimalOdds||2.0, {...bestO,impliedProb:1/bestO.decimalOdds});
      const tipTwo = r4(1/selBet?.decimalOdds + 1/bestO.decimalOdds);
      const isArb2 = tipTwo<1.0, isNear2=!isArb2&&tipTwo<1.04;
      suggestions.push({ kind:"hedge", hedge, mkt, cand:{ ...bestO, label:oc.label, impliedProb:1/bestO.decimalOdds },
        label:isArb2?"ARB":isNear2?"NEAR ARB":"HEDGE",
        isArb:isArb2, isNearArb:isNear2, tipTwo,
        sortScore:isArb2?0:isNear2?1:2, marketLabel:mkt.label, outcomeLabel:oc.label });
    }
  }
  return suggestions.sort((a,b)=>a.sortScore-b.sortScore);
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const ageSec = iso => Math.floor((Date.now()-new Date(iso).getTime())/1000);
const ageMin = iso => Math.floor(ageSec(iso)/60);
const fmtTime = iso => new Date(iso).toLocaleTimeString("no-NO",{hour:"2-digit",minute:"2-digit"});
const fmtDate = iso => new Date(iso).toLocaleDateString("no-NO",{weekday:"short",day:"numeric",month:"short"});
const pct = n => `${(n*100).toFixed(1)}%`;
const sign = n => n>=0?"+":"";

// ═══════════════════════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════
const Badge = ({children,color=C.accent,bg=C.accentDim,sx={}}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 8px",
    borderRadius:4,fontSize:10,fontWeight:700,letterSpacing:"0.06em",color,background:bg,flexShrink:0,...sx}}>
    {children}
  </span>
);

const Mono = ({children,color=C.tp,size=13}) => (
  <span style={{fontFamily:"'JetBrains Mono',monospace",color,fontSize:size,fontWeight:500}}>
    {children}
  </span>
);

const Spinner = ({size=12}) => (
  <span style={{display:"inline-block",width:size,height:size,borderRadius:"50%",
    border:`2px solid ${C.border}`,borderTopColor:C.accent,animation:"spin 0.8s linear infinite"}}/>
);

const LiveDot = () => (
  <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",
    background:C.red,animation:"pulse 1.1s ease-in-out infinite",flexShrink:0}}/>
);

const GlassCard = ({children,sx={},onClick}) => (
  <div onClick={onClick} style={{
    background:C.glass, backdropFilter:"blur(12px)",
    border:`1px solid ${C.glassBorder}`, borderRadius:16,
    ...sx, cursor:onClick?"pointer":"default",
    transition:"transform 0.15s,border-color 0.15s",
  }}
    onMouseEnter={e=>{if(onClick){e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.borderColor="rgba(255,255,255,0.14)";}}}
    onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.borderColor=C.glassBorder;}}
  >{children}</div>
);

const StatPill = ({label,value,color=C.tp,sub}) => (
  <div style={{padding:"10px 14px",background:C.surfaceUp,borderRadius:10,flex:1,minWidth:0}}>
    <div style={{fontSize:10,color:C.ts,marginBottom:3,fontWeight:500,letterSpacing:"0.05em"}}>{label}</div>
    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:18,fontWeight:700,color}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:C.tm,marginTop:1}}>{sub}</div>}
  </div>
);

const EVBar = ({ev, size=120}) => {
  const pct = Math.min(100, Math.max(0, (ev+0.15)/0.35*100));
  const color = ev>0.15?C.green:ev>0.05?C.amber:C.red;
  return (
    <div style={{width:size,height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:2,transition:"width 0.5s"}}/>
    </div>
  );
};

const Divider = ({label}) => (
  <div style={{display:"flex",alignItems:"center",gap:10,margin:"14px 0"}}>
    <div style={{flex:1,height:1,background:C.border}}/>
    {label&&<span style={{fontSize:10,color:C.tm,letterSpacing:"0.08em",whiteSpace:"nowrap"}}>{label}</span>}
    <div style={{flex:1,height:1,background:C.border}}/>
  </div>
);

const Section = ({title,action,children,sx={}}) => (
  <div style={{marginBottom:20,...sx}}>
    {title&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{fontSize:11,color:C.ts,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>{title}</div>
      {action&&<div style={{fontSize:11,color:C.accent,cursor:"pointer"}}>{action}</div>}
    </div>}
    {children}
  </div>
);

const DataSourceBanner = ({source,error,quota}) => {
  const live = source==="the_odds_api" || source==="the_odds_api_proxy";
  return (
    <div style={{marginBottom:14,padding:"10px 12px",borderRadius:10,
      background:live?C.greenDim:C.amberDim,
      border:`1px solid ${live?C.green:C.amber}33`,
      display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:11,color:live?C.green:C.amber}}>●</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:700,color:live?C.green:C.amber}}>
          {live?"Live odds aktiv":"Demo/fallback aktiv"}
        </div>
        <div style={{fontSize:10,color:C.ts,lineHeight:1.35}}>
          {live
            ? `The Odds API${source==="the_odds_api_proxy" ? " via server" : ""}${quota?.remaining ? ` · ${quota.remaining} kall igjen` : ""}`
            : error || "Legg inn VITE_ODDS_API_KEY for live odds."}
        </div>
      </div>
    </div>
  );
};

const RecommendationCard = ({bet,bankroll=10000}) => {
  const stake = Math.round(bankroll * bet.kelly);
  const color = bet.recommendation==="BET" ? C.green : C.amber;
  return (
    <GlassCard sx={{padding:"12px 14px",marginBottom:8,borderColor:`${color}44`}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start"}}>
        <div style={{minWidth:0}}>
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
            <Badge color={color} bg={bet.recommendation==="BET"?C.greenDim:C.amberDim}>{bet.recommendation}</Badge>
            <Badge color={C.accent} bg={C.accentDim}>EV {sign(bet.ev)}{pct(bet.ev)}</Badge>
          </div>
          <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {bet.matchLabel}
          </div>
          <div style={{fontSize:11,color:C.ts,marginTop:2}}>
            {bet.marketLabel} · {bet.outcomeLabel} · {bet.bookmaker}
          </div>
          <div style={{fontSize:10,color:C.tm,marginTop:6,lineHeight:1.4}}>
            {bet.reason}
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <Mono color={C.accent} size={18}>{bet.odds.toFixed(2)}</Mono>
          <div style={{fontSize:10,color:C.ts,marginTop:2}}>modell {pct(bet.modelProbability)}</div>
          <div style={{fontSize:10,color:C.ts}}>marked {pct(bet.marketProbability)}</div>
          <div style={{marginTop:5}}>
            <Mono color={color} size={12}>NOK {stake}</Mono>
            <div style={{fontSize:9,color:C.tm}}>25% Kelly</div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};

// Mini sparkline SVG
const Spark = ({data,color=C.accent,h=24,w=60}) => {
  if (!data||data.length<2) return null;
  const mn=Math.min(...data), mx=Math.max(...data), range=mx-mn||1;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-mn)/range)*h}`).join(" ");
  return (
    <svg width={w} height={h} style={{overflow:"visible"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

// P&L bar chart
const PLChart = ({scenarios,total}) => {
  if (!scenarios?.length) return null;
  const max = Math.max(...scenarios.map(s=>Math.abs(s.net)),1);
  return (
    <div style={{background:C.surfaceUp,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:10,color:C.ts,fontWeight:700,letterSpacing:"0.08em",marginBottom:10,textTransform:"uppercase"}}>P/L Scenarios</div>
      {scenarios.map((sc,i)=>{
        const barW = Math.abs(sc.net)/max*100;
        const pos = sc.net>=0;
        return (
          <div key={i} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.ts,marginBottom:3}}>
              <span>{sc.label}</span>
              <Mono color={pos?C.green:C.red} size={11}>{sign(sc.net)}NOK {sc.net}</Mono>
            </div>
            <div style={{height:6,background:C.border,borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${barW}%`,background:pos?C.green:C.red,borderRadius:3}}/>
            </div>
          </div>
        );
      })}
      <div style={{marginTop:8,fontSize:10,color:C.tm}}>Totalt investert: NOK {total}</div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TICKER BAR
// ═══════════════════════════════════════════════════════════════════════════════
const Ticker = ({movers}) => {
  const items = [...movers,...movers];
  return (
    <div style={{overflow:"hidden",background:C.surfaceUp,borderBottom:`1px solid ${C.border}`,
      padding:"5px 0",whiteSpace:"nowrap"}}>
      <div style={{display:"inline-block",animation:"ticker 30s linear infinite"}}>
        {items.map((m,i)=>(
          <span key={i} style={{marginRight:40,fontSize:11,color:C.ts}}>
            <span style={{color:C.tp,fontWeight:600}}>{m.match}</span>
            {" · "}<span style={{color:C.ts}}>{m.market}</span>
            {" "}<Mono color={C.amber} size={11}>{m.from.toFixed(2)}</Mono>
            <span style={{color:m.dir==="down"?C.green:C.red,margin:"0 3px"}}>{m.dir==="down"?"▼":"▲"}</span>
            <Mono color={m.dir==="down"?C.green:C.red} size={11}>{m.to.toFixed(2)}</Mono>
            <span style={{color:C.tm,marginLeft:6,fontSize:10}}>{m.reason}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
const Dashboard = ({matches,onSelectMatch,onNav,recommendations=[],dataSource,apiError,quota}) => {
  const liveMatches = matches.filter(m=>m.status==="live");
  const arbOps = ARB_OPS.filter(a=>a.margin>0);

  return (
    <div style={{padding:"16px",paddingBottom:80}}>
      <DataSourceBanner source={dataSource} error={apiError} quota={quota}/>

      {/* Hero stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:20}}>
        {[
          { label:"Åpen EV",          value:"+14.2%", color:C.green, sub:"Gj.snitt portefølje" },
          { label:"Live ARB",         value:arbOps.length,  color:C.amber, sub:"aktive muligheter" },
          { label:"Props i dag",      value:"23",     color:C.accent, sub:"+EV identifisert" },
          { label:"CLV siste 30d",    value:"+6.7%",  color:C.purple, sub:"Closing line value" },
        ].map(s=>(
          <GlassCard key={s.label} sx={{padding:"14px 16px"}}>
            <div style={{fontSize:10,color:C.ts,marginBottom:4,fontWeight:500,letterSpacing:"0.05em"}}>{s.label}</div>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
            <div style={{fontSize:10,color:C.tm,marginTop:2}}>{s.sub}</div>
          </GlassCard>
        ))}
      </div>

      {recommendations.length>0&&(
        <Section title="🧠 Reelle anbefalinger" action={<span onClick={()=>onNav(NAV.EV)}>Kelly →</span>}>
          <div style={{fontSize:11,color:C.ts,lineHeight:1.45,marginBottom:10}}>
            Basert på beste live odds, marginjustert markedssannsynlighet og enkel lagmodell. Bruk som beslutningsstøtte, ikke fasit.
          </div>
          {recommendations.slice(0,3).map((bet,i)=>(
            <RecommendationCard key={`${bet.matchId}-${bet.marketId}-${bet.outcomeId}-${i}`} bet={bet}/>
          ))}
        </Section>
      )}

      {/* Live matches */}
      {liveMatches.length>0&&(
        <Section title="🔴 Live kamper">
          {liveMatches.map(m=>(
            <GlassCard key={m.id} sx={{padding:"14px",marginBottom:10}} onClick={()=>onSelectMatch(m)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <LiveDot/>
                  <Badge color={C.red} bg={C.redDim}>{m.liveMinute}'</Badge>
                  <span style={{fontSize:11,color:C.ts}}>{m.round} · Gr.{m.group}</span>
                </div>
                <Badge color={C.amber} bg={C.amberDim}>xG {m.xg?.home.toFixed(1)}-{m.xg?.away.toFixed(1)}</Badge>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:16,fontWeight:700,display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                    <span style={{fontSize:22}}>{m.he}</span>{m.homeTeam}
                  </div>
                  <div style={{fontSize:16,fontWeight:700,display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:22}}>{m.ae}</span>{m.awayTeam}
                  </div>
                </div>
                {m.score&&(
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:30,fontWeight:900,
                    color:C.red,textAlign:"center",lineHeight:1.1}}>
                    {m.score.home}<br/>{m.score.away}
                  </div>
                )}
              </div>
              {m.possession&&(
                <div style={{marginTop:10}}>
                  <div style={{height:3,borderRadius:2,background:C.border,overflow:"hidden",display:"flex"}}>
                    <div style={{width:`${m.possession.home}%`,background:C.accent,transition:"width 1s"}}/>
                    <div style={{flex:1,background:C.purple}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.tm,marginTop:3}}>
                    <span>{m.possession.home}% ball</span>
                    <span>{m.possession.away}%</span>
                  </div>
                </div>
              )}
            </GlassCard>
          ))}
        </Section>
      )}

      {/* Top ARB */}
      <Section title="⚡ Top Arbitrage" action={<span onClick={()=>onNav(NAV.ARB)}>Se alle →</span>}>
        {ARB_OPS.slice(0,2).map(arb=>(
          <GlassCard key={arb.id} sx={{padding:"13px 14px",marginBottom:8,
            borderColor:arb.margin>0?`${C.green}44`:C.glassBorder}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{display:"flex",gap:6,marginBottom:4}}>
                  {arb.margin>0
                    ? <Badge color={C.green} bg={C.greenDim}>⚡ ARB +{pct(arb.margin)}</Badge>
                    : <Badge color={C.amber} bg={C.amberDim}>≈ NEAR ARB {pct(arb.margin)}</Badge>
                  }
                </div>
                <div style={{fontSize:13,fontWeight:600,color:C.ts}}>{arb.market}</div>
              </div>
              {arb.profit&&(
                <div style={{textAlign:"right"}}>
                  <Mono color={C.green} size={18}>+NOK {arb.profit}</Mono>
                  <div style={{fontSize:10,color:C.ts}}>per {arb.stakeBase}</div>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {arb.legs.map((leg,i)=>(
                <div key={i} style={{fontSize:11,padding:"3px 8px",borderRadius:5,
                  background:C.surfaceUp,border:`1px solid ${C.border}`}}>
                  <span style={{color:C.ts}}>{leg.outcome}: </span>
                  <Mono color={C.accent} size={11}>{leg.odds}</Mono>
                  <span style={{color:BOOKS[leg.book.toLowerCase().replace(" ","")]?.color||C.ts,fontSize:9,marginLeft:4}}>
                    {leg.book}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        ))}
      </Section>

      {/* Top Props */}
      <Section title="🎯 Top Player Props" action={<span onClick={()=>onNav(NAV.PROPS)}>Se alle →</span>}>
        {PLAYER_PROPS.filter(p=>p.ev>0.10).slice(0,3).map(pp=>(
          <GlassCard key={pp.id} sx={{padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:38,height:38,borderRadius:10,background:C.surfaceUp,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>
                  {pp.avatar}
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{pp.player}</div>
                  <div style={{fontSize:11,color:C.ts}}>{pp.market}</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <Badge color={pp.ev>0.15?C.green:C.amber} bg={pp.ev>0.15?C.greenDim:C.amberDim}>
                  +EV {sign(pp.ev)}{pct(pp.ev)}
                </Badge>
                <div style={{marginTop:4}}>
                  <Mono color={C.accent} size={14}>{pp.bookOdds}</Mono>
                  <span style={{fontSize:10,color:C.ts,marginLeft:4}}>model: {pp.modelProb*100|0}%</span>
                </div>
              </div>
            </div>
          </GlassCard>
        ))}
      </Section>

      {/* EV quick-access */}
      <GlassCard sx={{padding:"13px 14px",marginBottom:20,cursor:"pointer",
        background:`linear-gradient(135deg,rgba(48,209,88,0.07),rgba(10,132,255,0.04))`}}
        onClick={()=>onNav(NAV.EV)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>
              🎯 +EV Bet Finder — Kelly Calculator
            </div>
            <div style={{fontSize:11,color:C.ts}}>
              Bankroll management · Full Kelly-vekting · Min EV-filter
            </div>
          </div>
          <span style={{fontSize:20,color:C.green}}>→</span>
        </div>
      </GlassCard>

      {/* Market movers */}
      <Section title="📈 Smart Money Tracker" action={<span onClick={()=>onNav(NAV.MOVERS)}>Se alle →</span>}>
        {MOVERS.slice(0,3).map((mv,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"9px 0",borderBottom:`1px solid ${C.border}22`}}>
            <div>
              <div style={{fontSize:13,fontWeight:500}}>{mv.match}</div>
              <div style={{fontSize:11,color:C.ts}}>{mv.market} · {mv.book}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <Mono color={C.ts} size={12}>{mv.from.toFixed(2)}</Mono>
              <span style={{color:mv.dir==="down"?C.green:C.red,fontSize:12}}>→</span>
              <Mono color={mv.dir==="down"?C.green:C.red} size={12}>{mv.to.toFixed(2)}</Mono>
              <Badge color={C.amber} bg={C.amberDim} sx={{fontSize:9}}>{mv.reason}</Badge>
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD CUP SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const WorldCupScreen = ({matches,onSelect,loading,onRefresh,nextIn}) => {
  const [filter,setFilter] = useState("live_upcoming");
  const [search,setSearch] = useState("");
  const [showDisc,setShowDisc] = useState(true);

  const filters = [
    {id:"live_upcoming",label:"Live & Kommende"},
    {id:"upcoming",label:"Kommende"},
    {id:"live",label:"Live"},
    {id:"finished",label:"Ferdige"},
  ];

  const filtered = useMemo(()=>matches.filter(m=>{
    const s = filter==="live_upcoming"?(m.status==="live"||m.status==="upcoming"):m.status===filter;
    const q = search.toLowerCase();
    const mq = !q||[m.homeTeam,m.awayTeam,m.round].some(v=>v?.toLowerCase().includes(q));
    return s&&mq;
  }).sort((a,b)=>{
    if(a.status==="live"&&b.status!=="live") return -1;
    if(b.status==="live"&&a.status!=="live") return 1;
    return new Date(a.startsAt)-new Date(b.startsAt);
  }),[matches,filter,search]);

  const arbCount = useMemo(()=>matches.filter(m=>{
    const mkt=m.markets.find(mk=>mk.type==="1x2");
    if(!mkt)return false;
    const bMap=bestOdds(mkt.outcomes);
    return calcArb(bMap).isArb;
  }).length,[matches]);

  return (
    <div style={{minHeight:"100vh"}}>
      {/* Status bar */}
      <div style={{padding:"6px 16px",background:C.surfaceUp,borderBottom:`1px solid ${C.border}`,
        display:"flex",alignItems:"center",gap:8}}>
        {loading?<Spinner/>:<span style={{fontSize:10,color:C.green}}>●</span>}
        <span style={{fontSize:11,color:C.ts,flex:1}}>
          {loading?"Oppdaterer…":"LIVE"}
          {nextIn!==null&&!loading&&<span style={{color:C.tm}}> · neste {nextIn}s</span>}
        </span>
        {arbCount>0&&<Badge color={C.green} bg={C.greenDim}>⚡ {arbCount} ARB</Badge>}
        <button onClick={onRefresh} style={{background:"none",border:"none",color:C.accent,
          fontSize:11,cursor:"pointer",padding:0}}>↺</button>
      </div>
      {/* Filters */}
      <div style={{display:"flex",overflowX:"auto",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
        {filters.map(f=>(
          <button key={f.id} onClick={()=>setFilter(f.id)} style={{
            padding:"10px 14px",background:"none",border:"none",whiteSpace:"nowrap",
            color:filter===f.id?C.accent:C.ts,fontSize:12,fontWeight:filter===f.id?700:400,
            cursor:"pointer",borderBottom:`2px solid ${filter===f.id?C.accent:"transparent"}`,
          }}>{f.label}</button>
        ))}
      </div>
      <div style={{padding:"10px 16px 0",background:C.surface}}>
        <input placeholder="🔍  Søk kamp…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{width:"100%",padding:"9px 13px",background:C.surfaceUp,border:`1px solid ${C.border}`,
            borderRadius:10,color:C.tp,fontSize:13,outline:"none"}}/>
      </div>
      <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:10,paddingBottom:80}}>
        {showDisc&&(
          <div style={{background:C.amberDim,border:`1px solid ${C.amber}44`,borderRadius:10,
            padding:"10px 12px",display:"flex",gap:8,animation:"slideUp 0.3s ease"}}>
            <span style={{fontSize:15,flexShrink:0}}>⚠️</span>
            <span style={{fontSize:12,color:C.amber,lineHeight:1.5,flex:1}}>
              <strong>Ansvarlig spilling:</strong> Kun analyse. Gambling innebærer risiko.
            </span>
            <button onClick={()=>setShowDisc(false)} style={{background:"none",border:"none",
              color:C.amber,fontSize:18,cursor:"pointer",padding:"0 2px",lineHeight:1}}>×</button>
          </div>
        )}
        <div style={{fontSize:11,color:C.tm}}>⚽ FIFA VM 2026 · {filtered.length} kamper</div>
        {filtered.map(m=><WCMatchCard key={m.id} match={m} onSelect={onSelect}/>)}
        {filtered.length===0&&(
          <div style={{textAlign:"center",color:C.ts,padding:"48px 0",fontSize:14}}>
            <div style={{fontSize:32,marginBottom:10}}>🔍</div>Ingen kamper funnet
          </div>
        )}
      </div>
    </div>
  );
};

const WCMatchCard = ({match,onSelect}) => {
  const mkt = match.markets.find(m=>m.type==="1x2");
  const bMap = mkt ? bestOdds(mkt.outcomes) : {};
  const arb  = Object.keys(bMap).length>=2 ? calcArb(bMap) : null;
  const isLive=match.status==="live", isDone=match.status==="finished";
  return (
    <GlassCard onClick={()=>!isDone&&onSelect(match)} sx={{padding:"14px 16px",
      borderColor:isLive?`${C.red}55`:arb?.isArb?`${C.green}44`:C.glassBorder,
      opacity:isDone?0.65:1,
      boxShadow:isLive?`0 0 0 1px ${C.red}22,0 4px 20px rgba(255,69,58,0.1)`:
        arb?.isArb?`0 4px 20px rgba(48,209,88,0.08)`:""}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          {isLive&&<><LiveDot/><Badge color={C.red} bg={C.redDim}>{match.liveMinute}'</Badge></>}
          {isDone&&<Badge color={C.tm} bg={C.surfaceUp}>FERDIG</Badge>}
          <span style={{fontSize:10,color:C.ts}}>{match.round}{match.group?` · Gr.${match.group}`:""}</span>
          {!isLive&&!isDone&&<span style={{fontSize:10,color:C.ts}}>{fmtDate(match.startsAt)} {fmtTime(match.startsAt)}</span>}
        </div>
        <div style={{display:"flex",gap:4}}>
          {arb?.isArb&&<Badge color={C.green} bg={C.greenDim}>⚡ +{pct(arb.margin)}</Badge>}
          {!arb?.isArb&&arb?.isNearArb&&<Badge color={C.amber} bg={C.amberDim}>≈</Badge>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:700,display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
            <span style={{fontSize:22}}>{match.he}</span>{match.homeTeam}
          </div>
          <div style={{fontSize:16,fontWeight:700,display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontSize:22}}>{match.ae}</span>{match.awayTeam}
          </div>
        </div>
        {(isLive||isDone)&&match.score?(
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:30,fontWeight:900,
            color:isLive?C.red:C.tp,textAlign:"center",lineHeight:1.1}}>
            {match.score.home}<br/>{match.score.away}
          </div>
        ):(
          Object.keys(bMap).length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:80,alignItems:"flex-end"}}>
              {Object.values(bMap).map(od=>(
                <div key={od.id||od.outcome} style={{display:"flex",gap:5,alignItems:"center"}}>
                  <span style={{fontSize:10,color:C.ts,maxWidth:52,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {od.label}
                  </span>
                  <Mono color={C.accent} size={13}>{od.decimalOdds.toFixed(2)}</Mono>
                </div>
              ))}
            </div>
          )
        )}
      </div>
      {!isDone&&(
        <div style={{marginTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:C.tm}}>{match.markets.length} markeder</span>
          <span style={{fontSize:11,color:C.accent}}>Åpne hedge-analyse →</span>
        </div>
      )}
    </GlassCard>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER PROPS SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const PropsScreen = ({onSelectPlayer=()=>{}}) => {
  const [sort,setSort] = useState("ev");
  const [filter,setFilter] = useState("all");

  const sorted = useMemo(()=>[...PLAYER_PROPS].sort((a,b)=>{
    if(sort==="ev") return b.ev-a.ev;
    if(sort==="conf") return b.confidence-a.confidence;
    if(sort==="odds") return a.bookOdds-b.bookOdds;
    return 0;
  }).filter(p=>filter==="all"||p.rec===filter),[sort,filter]);

  return (
    <div style={{padding:"16px",paddingBottom:80}}>
      <Section title="🎯 Player Props — EV-analyse">
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {["ev","conf","odds"].map(s=>(
            <button key={s} onClick={()=>setSort(s)} style={{padding:"5px 12px",borderRadius:20,cursor:"pointer",
              border:`1px solid ${sort===s?C.accent:C.border}`,
              background:sort===s?C.accentDim:"transparent",
              color:sort===s?C.accent:C.ts,fontSize:11,fontWeight:500}}>
              {s==="ev"?"Sorter: EV":s==="conf"?"Konfidans":"Odds"}
            </button>
          ))}
          {["all","BET","PASS"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{padding:"5px 12px",borderRadius:20,cursor:"pointer",
              border:`1px solid ${filter===f?C.green:C.border}`,
              background:filter===f?C.greenDim:"transparent",
              color:filter===f?C.green:C.ts,fontSize:11,fontWeight:500}}>
              {f==="all"?"Alle":f}
            </button>
          ))}
        </div>
        {sorted.map(pp=><PropCard key={pp.id} pp={pp} onSelect={()=>onSelectPlayer(pp)}/>)}
      </Section>
    </div>
  );
};

const PropCard = ({pp, onSelect=()=>{}}) => {
  const [open,setOpen] = useState(false);
  const kellyStake = kelly(pp.modelProb, pp.bookOdds);
  const recColor = pp.rec==="BET"?C.green:pp.rec==="AVOID"?C.red:C.ts;
  return (
    <GlassCard sx={{marginBottom:10,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"13px 14px",cursor:"pointer"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div onClick={e=>{e.stopPropagation();onSelect();}}
              style={{width:42,height:42,borderRadius:12,background:C.surfaceUp,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,
              cursor:"pointer",border:`1px solid ${C.border}`}}>
              {pp.avatar}
            </div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontWeight:700,fontSize:15}}>{pp.player}</div>
                <button onClick={e=>{e.stopPropagation();onSelect();}} style={{
                  background:"none",border:"none",color:C.accent,fontSize:10,
                  cursor:"pointer",padding:0}}>→ profil</button>
              </div>
              <div style={{fontSize:11,color:C.ts}}>{pp.team} · {pp.market}{pp.line?` ${pp.line}`:""}</div>
              <div style={{marginTop:4,display:"flex",gap:5}}>
                <Badge color={recColor} bg={`${recColor}22`} sx={{fontSize:10}}>{pp.rec}</Badge>
                <Badge color={pp.ev>0.15?C.green:C.amber} bg={pp.ev>0.15?C.greenDim:C.amberDim} sx={{fontSize:10}}>
                  EV {sign(pp.ev)}{pct(pp.ev)}
                </Badge>
              </div>
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <Mono color={C.accent} size={20}>{pp.bookOdds}</Mono>
            <div style={{fontSize:10,color:C.ts,marginTop:2}}>Fair: {pp.fairOdds}</div>
            <div style={{marginTop:4}}>
              <EVBar ev={pp.ev}/>
            </div>
          </div>
        </div>
        {/* Form dots */}
        <div style={{display:"flex",gap:3,marginTop:10}}>
          <span style={{fontSize:10,color:C.ts,marginRight:4}}>Siste 10:</span>
          {pp.form.map((v,i)=>(
            <div key={i} style={{width:16,height:16,borderRadius:4,
              background:v?C.greenDim:C.redDim,border:`1px solid ${v?C.green:C.red}44`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,
              color:v?C.green:C.red}}>
              {v?"G":""}
            </div>
          ))}
        </div>
      </div>
      {open&&(
        <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.border}22`,animation:"fadeIn 0.2s ease"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:10}}>
            {[
              {l:"Modell sann.",v:pct(pp.modelProb),c:C.accent},
              {l:"Konfidans",  v:`${pp.confidence}/10`,c:pp.confidence>=8?C.green:pp.confidence>=6?C.amber:C.red},
              {l:"Kelly stake",v:pct(kellyStake),c:C.tp},
              {l:"Goals/5",    v:pp.stats.goals5,c:C.tp},
              {l:"Shots/5",    v:pp.stats.shots5,c:C.tp},
              {l:"SoT/5",      v:pp.stats.sot5,c:C.tp},
            ].map(s=>(
              <div key={s.l} style={{background:C.surfaceUp,borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:9,color:C.ts,marginBottom:2}}>{s.l}</div>
                <Mono color={s.c} size={14}>{s.v}</Mono>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,padding:"10px 12px",borderRadius:8,
            background:pp.ev>0?C.greenDim:C.redDim,
            border:`1px solid ${pp.ev>0?C.green:C.red}33`}}>
            <div style={{fontSize:11,color:C.ts,marginBottom:2}}>📊 Analyse</div>
            <div style={{fontSize:12,color:C.tp,lineHeight:1.5}}>
              Modellsannsynlighet ({pct(pp.modelProb)}) vs bookmaker ({pct(1/pp.bookOdds)}).
              Fair odds: <strong>{pp.fairOdds}</strong>. Kelly (25%): <strong>{pct(kellyStake)}</strong> av bankroll.
              {pp.ev>0.10?" ✅ Klar +EV edge — anbefalt bet.":" ⚠️ Marginal edge."}
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ARBITRAGE SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const ArbScreen = () => {
  const [stake,setStake] = useState(1000);
  const trueArbs = ARB_OPS.filter(a=>a.margin>0);
  const nearArbs = ARB_OPS.filter(a=>!a.margin||a.margin<=0);

  return (
    <div style={{padding:"16px",paddingBottom:80}}>
      <Section title="Beregn med innsats (NOK)">
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="number" value={stake} onChange={e=>setStake(Math.max(10,Number(e.target.value)))}
            style={{flex:1,padding:"10px 13px",background:C.surfaceUp,border:`1px solid ${C.border}`,
              borderRadius:10,color:C.tp,fontSize:16,fontFamily:"'JetBrains Mono',monospace",outline:"none"}}/>
          {[500,1000,5000].map(n=>(
            <button key={n} onClick={()=>setStake(n)} style={{padding:"10px 14px",borderRadius:10,cursor:"pointer",
              border:`1px solid ${stake===n?C.accent:C.border}`,background:stake===n?C.accentDim:"transparent",
              color:stake===n?C.accent:C.ts,fontSize:12,fontWeight:500}}>
              {n/1000>0?n/1000+"k":n}
            </button>
          ))}
        </div>
      </Section>

      <Section title={`⚡ ${trueArbs.length} Live Arbitrage`}>
        {trueArbs.map(arb=><ArbCard key={arb.id} arb={arb} stake={stake}/>)}
        {trueArbs.length===0&&(
          <div style={{textAlign:"center",padding:"30px",color:C.ts,fontSize:13}}>
            Ingen rene arbitrage-muligheter akkurat nå
          </div>
        )}
      </Section>

      <Divider label="NEAR ARBITRAGE (0–4% over 100%)"/>

      <Section title={`≈ ${nearArbs.length} Near-ARB`}>
        {nearArbs.map(arb=><ArbCard key={arb.id} arb={arb} stake={stake}/>)}
      </Section>
    </div>
  );
};

const ArbCard = ({arb,stake}) => {
  const [open,setOpen] = useState(arb.margin>0);
  const isArb = arb.margin>0;
  const scaledProfit = arb.profit ? r2(arb.profit * stake/arb.stakeBase) : null;
  const scaledLegs = arb.legs.map(leg => ({
    ...leg,
    calcStake: r2(stake * leg.impliedProb / arb.totalIP),
  }));

  return (
    <GlassCard sx={{marginBottom:10,overflow:"hidden",
      borderColor:isArb?`${C.green}44`:C.glassBorder}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"13px 14px",cursor:"pointer"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
              {isArb
                ? <Badge color={C.green} bg={C.greenDim}>⚡ ARB</Badge>
                : <Badge color={C.amber} bg={C.amberDim}>≈ NEAR ARB</Badge>
              }
              <Mono color={isArb?C.green:C.amber} size={12}>
                {pct(Math.abs(arb.margin))} {isArb?"fortjeneste":"over fair"}
              </Mono>
            </div>
            <div style={{fontSize:13,color:C.ts}}>{arb.market}</div>
          </div>
          {scaledProfit&&(
            <div style={{textAlign:"right"}}>
              <Mono color={C.green} size={18}>+NOK {scaledProfit}</Mono>
              <div style={{fontSize:10,color:C.ts}}>garantert</div>
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {arb.legs.map((leg,i)=>(
            <div key={i} style={{fontSize:11,padding:"3px 9px",borderRadius:6,
              background:C.surfaceUp,border:`1px solid ${C.border}`}}>
              <span style={{color:C.ts}}>{leg.outcome}: </span>
              <Mono color={C.tp} size={11}>{leg.odds}</Mono>
              <span style={{fontSize:9,marginLeft:4,color:BOOKS[leg.book.toLowerCase().replace(/\s/g,"")]?.color||C.ts}}>
                @{leg.book}
              </span>
            </div>
          ))}
        </div>
      </div>
      {open&&isArb&&(
        <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.green}22`}}>
          <div style={{fontSize:10,color:C.ts,marginBottom:8,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>
            Innsatsfordeling ved NOK {stake}
          </div>
          {scaledLegs.map((leg,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 12px",borderRadius:8,background:C.surfaceUp,marginBottom:6}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{leg.outcome}</div>
                <div style={{fontSize:11,color:BOOKS[leg.book.toLowerCase().replace(/\s/g,"")]?.color||C.ts}}>
                  {leg.book} @ {leg.odds}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <Mono color={C.accent} size={14}>NOK {leg.calcStake}</Mono>
                <div style={{fontSize:10,color:C.ts}}>→ {r2(leg.calcStake*leg.odds)}</div>
              </div>
            </div>
          ))}
          <div style={{padding:"10px 12px",borderRadius:8,background:C.greenDim,
            border:`1px solid ${C.green}33`,display:"flex",justifyContent:"space-between",marginTop:4}}>
            <span style={{fontWeight:600,color:C.green}}>Garantert profitt</span>
            <Mono color={C.green} size={16}>+NOK {scaledProfit}</Mono>
          </div>
        </div>
      )}
    </GlassCard>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════════
const Onboarding = ({onDone}) => {
  const [step,setStep] = useState(0);
  const steps = [
    {
      icon:"⚡", color:C.accent,
      title:"OddsArb Pro",
      sub:"Bloomberg Terminal for Sports Betting",
      body:"Aggregerer live odds fra 11+ bookmakers, AI-modeller og prediction markets. Finn arbitrage, +EV bets og hedgingsmuligheter i sanntid.",
    },
    {
      icon:"🎯", color:C.green,
      title:"+EV Bet Finder",
      sub:"Kun positive expected value bets",
      body:"XGBoost og LightGBM beregner sann sannsynlighet. Kelly Criterion gir optimal innsatsstørrelse. Bare bets med reell edge vises.",
    },
    {
      icon:"⚡", color:C.amber,
      title:"Arbitrage Engine",
      sub:"Garantert risikofri profitt",
      body:"Kontinuerlig skanning av alle bookmakers. Varsel umiddelbart når implisert sannsynlighet summerer under 100%.",
    },
    {
      icon:"🛡", color:C.purple,
      title:"Hedge Calculator",
      sub:"Lås inn profitt, kutt risiko",
      body:"Velg et bet — systemet analyserer automatisk alle motstående og komplementære bets på tvers av alle markeder.",
    },
    {
      icon:"⚠️", color:C.red,
      title:"Ansvarlig spilling",
      sub:"Viktig informasjon",
      body:"Denne appen gir kun analyse og informasjon. Ingen innsatser plasseres automatisk. Gambling innebærer risiko. Spill aldri mer enn du har råd til å tape.",
    },
  ];
  const s = steps[step];
  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:"32px 24px",
      animation:"fadeIn 0.4s ease",position:"relative",overflow:"hidden"}}>
      {/* Ambient glow */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",
        background:`radial-gradient(ellipse at 50% 30%, ${s.color}0a 0%, transparent 65%)`}}/>
      <div style={{fontSize:80,marginBottom:28,
        filter:`drop-shadow(0 0 28px ${s.color}55)`}}>
        {s.icon}
      </div>
      <div style={{fontSize:26,fontWeight:900,letterSpacing:"-0.04em",textAlign:"center",
        marginBottom:6,lineHeight:1.1}}>
        {s.title}
      </div>
      <div style={{fontSize:13,color:s.color,fontWeight:600,marginBottom:18,
        letterSpacing:"0.02em",textAlign:"center"}}>
        {s.sub}
      </div>
      <div style={{fontSize:15,color:C.ts,textAlign:"center",lineHeight:1.75,
        marginBottom:52,maxWidth:340}}>
        {s.body}
      </div>
      {/* Progress dots */}
      <div style={{display:"flex",gap:6,marginBottom:32}}>
        {steps.map((_,i)=>(
          <div key={i} style={{height:3,borderRadius:2,transition:"all 0.3s",
            width:i===step?28:8,
            background:i===step?s.color:C.border}}/>
        ))}
      </div>
      <button onClick={()=>step<steps.length-1?setStep(s=>s+1):onDone()} style={{
        padding:"15px 0",borderRadius:14,border:"none",cursor:"pointer",
        fontSize:16,fontWeight:700,width:"100%",maxWidth:320,letterSpacing:"0.01em",
        background:`linear-gradient(135deg,${s.color},${s.color}aa)`,
        color: step===4?"#fff":"#000",
        boxShadow:`0 8px 32px ${s.color}33`,
      }}>
        {step<steps.length-1?"Neste →":"Kom i gang →"}
      </button>
      {step>0&&(
        <button onClick={()=>setStep(s=>s-1)} style={{marginTop:14,background:"none",
          border:"none",color:C.ts,cursor:"pointer",fontSize:13}}>
          ← Tilbake
        </button>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// +EV SCREEN — Kelly-kalkulator + full bankroll management
// ═══════════════════════════════════════════════════════════════════════════════
const EVScreen = ({recommendations=[]}) => {
  const [bankroll, setBankroll] = useState(10000);
  const [fraction, setFraction] = useState(0.25);
  const [sort, setSort]         = useState("ev");
  const [minEV, setMinEV]       = useState(0.05);

  const sorted = useMemo(()=>[...PLAYER_PROPS]
    .filter(p=>p.ev>=minEV)
    .sort((a,b)=>sort==="ev"?b.ev-a.ev:b.confidence-a.confidence),
    [sort,minEV]);

  const totalKellyPct = sorted.reduce((s,p)=>s+kelly(p.modelProb,p.bookOdds,fraction),0);
  const totalKellyNOK = Math.round(bankroll*totalKellyPct);
  const weightedEV    = sorted.length ? sorted.reduce((s,p)=>s+p.ev,0)/sorted.length : 0;

  return (
    <div style={{padding:"16px",paddingBottom:80}}>
      {recommendations.length>0&&(
        <Section title="Live odds-anbefalinger">
          <div style={{fontSize:12,color:C.ts,lineHeight:1.5,marginBottom:12}}>
            Disse beregnes fra beste tilgjengelige odds, bookmaker-margin og enkel historikkmodell. Ikke plasser bets uten egen vurdering av lagnyheter, skader og markedslikviditet.
          </div>
          {recommendations.slice(0,8).map((bet,i)=>(
            <RecommendationCard key={`${bet.matchId}-${bet.marketId}-${bet.outcomeId}-${i}`} bet={bet} bankroll={bankroll}/>
          ))}
        </Section>
      )}

      <Section title="+EV Bet Finder — Kelly Criterion">

        {/* Bankroll control */}
        <GlassCard sx={{padding:"16px",marginBottom:14,
          background:`linear-gradient(135deg,rgba(48,209,88,0.07),rgba(10,132,255,0.04))`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:12,color:C.ts,fontWeight:600}}>Bankroll</span>
            <Mono color={C.green} size={18}>NOK {bankroll.toLocaleString("no-NO")}</Mono>
          </div>
          <input type="range" min={1000} max={500000} step={1000} value={bankroll}
            onChange={e=>setBankroll(Number(e.target.value))}
            style={{marginBottom:12}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:12,color:C.ts,fontWeight:600}}>Kelly-fraksjon</span>
            <Mono color={C.accent} size={14}>{(fraction*100).toFixed(0)}%</Mono>
          </div>
          <div style={{display:"flex",gap:6}}>
            {[0.1,0.25,0.5,1.0].map(f=>(
              <button key={f} onClick={()=>setFraction(f)} style={{
                flex:1,padding:"6px 0",borderRadius:8,cursor:"pointer",
                border:`1px solid ${fraction===f?C.accent:C.border}`,
                background:fraction===f?C.accentDim:"transparent",
                color:fraction===f?C.accent:C.ts,fontSize:12,fontWeight:600}}>
                {f===0.1?"10%":f===0.25?"25%":f===0.5?"50%":"Full"}
              </button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:12}}>
            {[
              {l:"Anbefalt total",  v:`NOK ${totalKellyNOK.toLocaleString("no-NO")}`, c:C.green},
              {l:"% av bankroll",   v:`${(totalKellyPct*100).toFixed(1)}%`,            c:C.accent},
              {l:"Snitt EV",        v:`+${(weightedEV*100).toFixed(1)}%`,              c:C.amber},
            ].map(s=>(
              <div key={s.l} style={{background:C.surfaceUp,borderRadius:8,padding:"8px",textAlign:"center"}}>
                <Mono color={s.c} size={12}>{s.v}</Mono>
                <div style={{fontSize:9,color:C.tm,marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Filters */}
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {["ev","conf"].map(k=>(
            <button key={k} onClick={()=>setSort(k)} style={{padding:"5px 12px",borderRadius:20,cursor:"pointer",
              border:`1px solid ${sort===k?C.accent:C.border}`,
              background:sort===k?C.accentDim:"transparent",
              color:sort===k?C.accent:C.ts,fontSize:11,fontWeight:500}}>
              {k==="ev"?"EV %":"Konfidans"}
            </button>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
            <span style={{fontSize:11,color:C.ts}}>Min EV:</span>
            <select value={minEV} onChange={e=>setMinEV(Number(e.target.value))} style={{
              background:C.surfaceUp,border:`1px solid ${C.border}`,borderRadius:6,
              color:C.tp,fontSize:11,padding:"4px 8px",cursor:"pointer"}}>
              {[0,0.03,0.05,0.10,0.15].map(v=>(
                <option key={v} value={v}>{v===0?"Alle":`+${(v*100).toFixed(0)}%`}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bet cards */}
        {sorted.map(pp=>{
          const ks     = kelly(pp.modelProb, pp.bookOdds, fraction);
          const stake  = Math.round(bankroll * ks);
          const potRet = Math.round(stake * pp.bookOdds);
          const potProfit = potRet - stake;
          const recColor = pp.rec==="BET"?C.green:pp.rec==="AVOID"?C.red:C.ts;
          return (
            <GlassCard key={pp.id} sx={{marginBottom:10,
              borderColor:pp.ev>=0.15?`${C.green}44`:C.glassBorder,
              boxShadow:pp.ev>=0.20?`0 0 16px ${C.green}18`:"none"}}>
              <div style={{padding:"13px 14px"}}>
                {/* Top */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{width:44,height:44,borderRadius:12,background:C.surfaceUp,
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
                      {pp.avatar}
                    </div>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{pp.player}</div>
                      <div style={{fontSize:11,color:C.ts}}>{pp.team}</div>
                      <div style={{fontSize:11,color:C.ts}}>{pp.market}{pp.line?` (${pp.line})`:""}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <Mono color={C.accent} size={20}>{pp.bookOdds}</Mono>
                    <div style={{fontSize:10,color:C.ts}}>Fair: {pp.fairOdds}</div>
                    <Badge color={recColor} bg={`${recColor}22`} sx={{marginTop:3,fontSize:10}}>
                      {pp.rec}
                    </Badge>
                  </div>
                </div>

                {/* Stats grid */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                  {[
                    {l:"Prob",   v:pct(pp.modelProb),         c:C.tp},
                    {l:"Edge",   v:`+${pct(pp.ev)}`,           c:pp.ev>=0.10?C.green:C.amber},
                    {l:"Kelly",  v:pct(ks),                    c:C.accent},
                    {l:"Innsats",v:`NOK ${stake.toLocaleString("no-NO")}`, c:C.amber},
                  ].map(s=>(
                    <div key={s.l} style={{background:C.surfaceUp,borderRadius:8,padding:"7px 5px",textAlign:"center"}}>
                      <Mono color={s.c} size={11}>{s.v}</Mono>
                      <div style={{fontSize:9,color:C.tm,marginTop:2}}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Confidence bar */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:10,color:C.ts,flexShrink:0}}>Konfidans</span>
                  <div style={{flex:1,height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pp.confidence*10}%`,borderRadius:2,
                      background:pp.confidence>=8?C.green:pp.confidence>=6?C.amber:C.red,
                      transition:"width 0.5s"}}/>
                  </div>
                  <Mono size={11} color={pp.confidence>=8?C.green:pp.confidence>=6?C.amber:C.red}>
                    {pp.confidence}/10
                  </Mono>
                </div>

                {/* Payout row */}
                <div style={{padding:"9px 12px",borderRadius:9,
                  background:pp.ev>0?C.greenDim:C.redDim,
                  border:`1px solid ${pp.ev>0?C.green:C.red}33`,
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:11,color:C.ts}}>
                    Potensiell gevinst
                  </div>
                  <div style={{textAlign:"right"}}>
                    <Mono color={C.green} size={14}>+NOK {potProfit.toLocaleString("no-NO")}</Mono>
                    <div style={{fontSize:9,color:C.tm}}>ved NOK {stake.toLocaleString("no-NO")} innsats</div>
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })}

        {sorted.length===0&&(
          <div style={{textAlign:"center",padding:"40px 0",color:C.ts}}>
            <div style={{fontSize:32,marginBottom:10}}>🔍</div>
            Ingen bets med EV over {(minEV*100).toFixed(0)}% akkurat nå
          </div>
        )}
      </Section>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER DETAIL SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const PlayerDetailScreen = ({player, onBack}) => {
  const [tab,setTab] = useState("props");
  if (!player) return null;
  const p = player;
  const tabs = [{id:"props",l:"Props"},{id:"form",l:"Form"},{id:"stats",l:"Statistikk"}];

  return (
    <div style={{paddingBottom:80}}>
      {/* Sticky header */}
      <div style={{background:`${C.surface}ee`,backdropFilter:"blur(20px)",
        borderBottom:`1px solid ${C.border}`,position:"sticky",top:78,zIndex:20,padding:"12px 16px 0"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.ts,
          cursor:"pointer",fontSize:13,marginBottom:10,padding:0,display:"flex",
          alignItems:"center",gap:4}}>
          ← Tilbake
        </button>
        <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:60,lineHeight:1,
            filter:`drop-shadow(0 0 16px rgba(255,255,255,0.15))`}}>
            {p.avatar}
          </div>
          <div>
            <div style={{fontSize:22,fontWeight:900,letterSpacing:"-0.03em",lineHeight:1.1,marginBottom:4}}>
              {p.player}
            </div>
            <div style={{fontSize:13,color:C.ts,marginBottom:6}}>{p.team} · {p.position}</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              <Badge color={C.amber} bg={C.amberDim}>{p.nationality}</Badge>
              <Badge color={C.purple} bg={C.purpleDim}>Rating {p.seasonRating}</Badge>
              <Badge color={C.cyan} bg={C.cyanDim}>{p.marketValue}</Badge>
            </div>
          </div>
        </div>
        {/* Quick season stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:12}}>
          {[
            {l:"Mål",  v:p.seasonGoals},
            {l:"xG",   v:p.seasonXG},
            {l:"Assist",v:p.seasonAssists},
            {l:"App",  v:p.appearances},
          ].map(s=>(
            <div key={s.l} style={{background:C.surfaceUp,borderRadius:8,padding:"7px",textAlign:"center",
              border:`1px solid ${C.border}`}}>
              <Mono color={C.tp} size={15}>{s.v}</Mono>
              <div style={{fontSize:9,color:C.tm,marginTop:1}}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:10}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"6px 14px",borderRadius:20,whiteSpace:"nowrap",
              border:`1px solid ${tab===t.id?C.accent:C.border}`,
              background:tab===t.id?C.accentDim:"transparent",
              color:tab===t.id?C.accent:C.ts,fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px"}}>

        {/* PROPS TAB */}
        {tab==="props"&&(
          <div>
            <Section title="AI Prop Predictions">
              {p.props.map((prop,i)=>{
                const ks = kelly(prop.modelProb, prop.bookOdds);
                const isGood = prop.rec==="BET";
                return (
                  <GlassCard key={i} sx={{marginBottom:10,
                    borderColor:isGood?`${C.green}44`:C.glassBorder}}>
                    <div style={{padding:"13px 14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"flex-start",marginBottom:10}}>
                        <div>
                          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>
                            {prop.market}
                          </div>
                          <div style={{display:"flex",gap:5}}>
                            <Badge color={isGood?C.green:C.red} bg={isGood?C.greenDim:C.redDim}
                              sx={{fontSize:11}}>
                              {isGood?"✓ BET":"✗ PASS"}
                            </Badge>
                            <Badge color={prop.ev>0.10?C.green:C.amber}
                              bg={prop.ev>0.10?C.greenDim:C.amberDim} sx={{fontSize:10}}>
                              EV {sign(prop.ev)}{pct(prop.ev)}
                            </Badge>
                          </div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:10,color:C.ts,marginBottom:2}}>Book odds</div>
                          <Mono color={C.accent} size={22}>{prop.bookOdds}</Mono>
                          <div style={{fontSize:10,color:C.ts}}>Fair: {prop.fairOdds}</div>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
                        {[
                          {l:"Model sann.",v:pct(prop.modelProb),c:C.tp},
                          {l:"Edge",       v:`${sign(prop.ev)}${pct(prop.ev)}`,c:prop.ev>0?C.green:C.red},
                          {l:"Konfidans",  v:`${prop.confidence}/10`,c:prop.confidence>=8?C.green:C.amber},
                        ].map(s=>(
                          <div key={s.l} style={{background:C.surfaceUp,borderRadius:8,padding:"9px",textAlign:"center"}}>
                            <Mono color={s.c} size={13}>{s.v}</Mono>
                            <div style={{fontSize:9,color:C.tm,marginTop:2}}>{s.l}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:10,color:C.ts,flexShrink:0}}>Konfidans</span>
                        <div style={{flex:1,height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",
                            width:`${prop.confidence*10}%`,borderRadius:2,
                            background:prop.confidence>=8?C.green:prop.confidence>=6?C.amber:C.red,
                            transition:"width 0.5s"}}/>
                        </div>
                        <Mono size={10} color={prop.confidence>=8?C.green:C.amber}>
                          {prop.confidence}/10
                        </Mono>
                      </div>
                      {isGood&&(
                        <div style={{marginTop:10,padding:"8px 10px",borderRadius:8,
                          background:C.greenDim,border:`1px solid ${C.green}33`,fontSize:11,color:C.ts}}>
                          Kelly ({(ks*100).toFixed(1)}% av bankroll) er anbefalt innsatsstørrelse for denne edgen.
                        </div>
                      )}
                    </div>
                  </GlassCard>
                );
              })}
            </Section>
          </div>
        )}

        {/* FORM TAB */}
        {tab==="form"&&(
          <div>
            <GlassCard sx={{padding:"14px",marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:4}}>
                <div>
                  <div style={{fontSize:11,color:C.ts,marginBottom:4}}>Mål siste 5 kamper</div>
                  <Mono color={C.green} size={28}>{p.recentForm.reduce((s,f)=>s+f.goals,0)}</Mono>
                </div>
                <Spark data={p.recentForm.map(f=>f.goals)} color={C.green} w={120} h={44}/>
              </div>
              <div style={{fontSize:11,color:C.ts,marginTop:8}}>
                xG siste 5: <Mono color={C.accent} size={11}>
                  {p.recentForm.reduce((s,f)=>s+f.xG,0).toFixed(2)}
                </Mono>
              </div>
            </GlassCard>
            <Section title="Kamphistorikk">
              {p.recentForm.map((f,i)=>(
                <GlassCard key={i} sx={{padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{f.match}</div>
                      <div style={{fontSize:11,color:C.ts}}>xG: {f.xG.toFixed(2)}</div>
                    </div>
                    <div style={{display:"flex",gap:12,alignItems:"center"}}>
                      {[
                        {v:f.goals,   l:"mål",  c:C.green},
                        {v:f.assists, l:"ast",  c:C.accent},
                        {v:f.shots,   l:"skt",  c:C.tp},
                        {v:f.rating,  l:"rat",  c:f.rating>=8?C.green:f.rating>=6?C.amber:C.red},
                      ].map(s=>(
                        <div key={s.l} style={{textAlign:"center",minWidth:28}}>
                          <Mono color={s.c} size={16}>{s.v}</Mono>
                          <div style={{fontSize:9,color:C.tm}}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </GlassCard>
              ))}
            </Section>
          </div>
        )}

        {/* STATS TAB */}
        {tab==="stats"&&(
          <GlassCard sx={{padding:"14px"}}>
            <Section title="Sesongstatistikk 2025/26" sx={{marginBottom:0}}>
              {[
                {l:"Kamper",              v:p.appearances},
                {l:"Mål",                 v:p.seasonGoals,    c:C.green},
                {l:"xG",                  v:p.seasonXG,       c:C.accent},
                {l:"Assists",             v:p.seasonAssists,  c:C.green},
                {l:"Shots",               v:p.stats.shots5*2,},
                {l:"Shots on target",     v:p.stats.sot5*2,},
                {l:"Mål per kamp",        v:(p.seasonGoals/Math.max(p.appearances,1)).toFixed(2)},
                {l:"xG per kamp",         v:(p.seasonXG/Math.max(p.appearances,1)).toFixed(2), c:C.accent},
                {l:"Gule kort",           v:p.stats.yellowCards||2, c:C.amber},
                {l:"Markedsverdi",        v:p.marketValue, c:C.amber},
                {l:"Sesong-rating",       v:p.seasonRating, c:C.purple},
              ].map(s=>(
                <div key={s.l} style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"8px 0",
                  borderBottom:`1px solid ${C.border}22`}}>
                  <span style={{fontSize:12,color:C.ts}}>{s.l}</span>
                  <Mono color={s.c||C.tp} size={13}>{s.v}</Mono>
                </div>
              ))}
            </Section>
          </GlassCard>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET MOVERS SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const MoversScreen = () => {
  const [filter, setFilter] = useState("all");

  const categories = {
    all:    {label:"Alle", data: MOVERS},
    sharp:  {label:"Sharp money", data: MOVERS.filter(m=>m.reason==="Sharp money")},
    injury: {label:"Skader", data: MOVERS.filter(m=>m.reason==="Injury news"||m.reason==="Suspended")},
    steam:  {label:"Steam moves", data: MOVERS.filter(m=>m.reason==="Steam move"||m.reason==="Public betting")},
  };
  const current = categories[filter]?.data || MOVERS;

  return (
    <div style={{padding:"16px",paddingBottom:80}}>
      <Section title="📈 Market Movers — Smart Money Tracker">
        <div style={{fontSize:12,color:C.ts,marginBottom:14,lineHeight:1.6}}>
          Sporer odds-bevegelser fra bookmakers i sanntid. Store bevegelser mot Pinnacle indikerer often
          "sharp money" — informerte spillere som har funnet en edge.
        </div>

        {/* Filter pills */}
        <div style={{display:"flex",gap:6,marginBottom:16,overflowX:"auto"}}>
          {Object.entries(categories).map(([k,v])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{
              padding:"5px 12px",borderRadius:20,whiteSpace:"nowrap",cursor:"pointer",
              border:`1px solid ${filter===k?C.accent:C.border}`,
              background:filter===k?C.accentDim:"transparent",
              color:filter===k?C.accent:C.ts,fontSize:11,fontWeight:500}}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Summary boxes */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
          {[
            {l:"Bevegelser",   v:current.length,              c:C.tp},
            {l:"Ned (shorts)", v:current.filter(m=>m.dir==="down").length,  c:C.green},
            {l:"Opp (longs)",  v:current.filter(m=>m.dir==="up").length,    c:C.red},
          ].map(s=>(
            <GlassCard key={s.l} sx={{padding:"10px",textAlign:"center"}}>
              <Mono color={s.c} size={18}>{s.v}</Mono>
              <div style={{fontSize:9,color:C.tm,marginTop:2}}>{s.l}</div>
            </GlassCard>
          ))}
        </div>

        {/* Movers list */}
        {current.map((mv,i)=>{
          const pctChange = ((mv.to-mv.from)/mv.from*100);
          const isDown = mv.dir==="down";
          return (
            <GlassCard key={i} sx={{marginBottom:10,
              borderColor:isDown?`${C.green}33`:`${C.red}33`}}>
              <div style={{padding:"13px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>{mv.match}</div>
                    <div style={{fontSize:11,color:C.ts,marginBottom:5}}>
                      {mv.market} · <span style={{color:BOOKS[mv.book?.toLowerCase()]?.color||C.ts}}>{mv.book}</span>
                    </div>
                    <Badge color={C.amber} bg={C.amberDim} sx={{fontSize:10}}>{mv.reason}</Badge>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div>
                        <div style={{fontSize:10,color:C.ts,marginBottom:2}}>Fra</div>
                        <Mono color={C.ts} size={16}>{mv.from.toFixed(2)}</Mono>
                      </div>
                      <span style={{fontSize:18,color:isDown?C.green:C.red}}>
                        {isDown?"▼":"▲"}
                      </span>
                      <div>
                        <div style={{fontSize:10,color:C.ts,marginBottom:2}}>Til</div>
                        <Mono color={isDown?C.green:C.red} size={16}>{mv.to.toFixed(2)}</Mono>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Change bar */}
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",
                      width:`${Math.min(100,Math.abs(pctChange)*10)}%`,
                      background:isDown?C.green:C.red,borderRadius:2}}/>
                  </div>
                  <Mono color={isDown?C.green:C.red} size={11}>
                    {isDown?"-":"+"}{ Math.abs(pctChange).toFixed(1)}%
                  </Mono>
                </div>
                <div style={{fontSize:10,color:C.tm,marginTop:6}}>
                  {isDown
                    ? "Odds falt → mer penger på dette utfallet. Kan indikere sharp money eller ny informasjon."
                    : "Odds steg → bookmaker tar posisjon eller public backing har drevet dem opp."}
                </div>
              </div>
            </GlassCard>
          );
        })}
      </Section>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const SettingsScreen = ({onBack}) => {
  const [refreshSec, setRefreshSec] = useState(30);
  const [activeBooks, setActiveBooks] = useState(
    Object.fromEntries(Object.keys(BOOKS).map(k=>[k,true]))
  );
  const [notifications, setNotifications] = useState({arb:true,ev:true,injury:false,mover:false});
  const [saved, setSaved] = useState(false);

  const toggleBook = bk => setActiveBooks(p=>({...p,[bk]:!p[bk]}));
  const toggleNotif = k => setNotifications(p=>({...p,[k]:!p[k]}));
  const save = () => { setSaved(true); setTimeout(()=>setSaved(false),1800); };

  return (
    <div style={{padding:"16px",paddingBottom:80}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.ts,
          cursor:"pointer",fontSize:20,padding:0,lineHeight:1}}>←</button>
        <div style={{fontSize:13,fontWeight:700,letterSpacing:"-0.02em"}}>Innstillinger</div>
      </div>

      {/* Refresh interval */}
      <Section title="Oppdateringsintervall">
        <GlassCard sx={{padding:"14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:13,color:C.ts}}>Oppdater odds hvert</span>
            <Mono color={C.accent} size={13}>{refreshSec}s</Mono>
          </div>
          <div style={{display:"flex",gap:6}}>
            {[15,30,60,120].map(s=>(
              <button key={s} onClick={()=>setRefreshSec(s)} style={{
                flex:1,padding:"7px 0",borderRadius:8,cursor:"pointer",
                border:`1px solid ${refreshSec===s?C.accent:C.border}`,
                background:refreshSec===s?C.accentDim:"transparent",
                color:refreshSec===s?C.accent:C.ts,fontSize:12,fontWeight:600}}>
                {s}s
              </button>
            ))}
          </div>
        </GlassCard>
      </Section>

      {/* Notifications */}
      <Section title="Varsler">
        <GlassCard sx={{overflow:"hidden"}}>
          {[
            {k:"arb",   l:"Arbitrage-varsler",    sub:"Varsel når ARB > 1%"},
            {k:"ev",    l:"+EV Bet-varsler",       sub:"Varsel ved nye +EV bets"},
            {k:"injury",l:"Skade-nyheter",         sub:"Viktige lagoppdateringer"},
            {k:"mover", l:"Market movers",         sub:"Store odds-bevegelser"},
          ].map((item,i,arr)=>(
            <div key={item.k} onClick={()=>toggleNotif(item.k)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"12px 14px",cursor:"pointer",
                borderBottom:i<arr.length-1?`1px solid ${C.border}22`:"none"}}>
              <div>
                <div style={{fontSize:13,fontWeight:500}}>{item.l}</div>
                <div style={{fontSize:11,color:C.ts}}>{item.sub}</div>
              </div>
              <div style={{width:42,height:24,borderRadius:12,
                background:notifications[item.k]?C.green:C.border,
                position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{position:"absolute",top:3,
                  left:notifications[item.k]?20:3,
                  width:18,height:18,borderRadius:"50%",
                  background:"#fff",transition:"left 0.2s",
                  boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
              </div>
            </div>
          ))}
        </GlassCard>
      </Section>

      {/* Active bookmakers */}
      <Section title="Aktive bookmakers">
        <GlassCard sx={{overflow:"hidden"}}>
          {Object.entries(BOOKS).map(([bk,info],i,arr)=>(
            <div key={bk} onClick={()=>toggleBook(bk)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"11px 14px",cursor:"pointer",
                borderBottom:i<arr.length-1?`1px solid ${C.border}22`:"none",
                opacity:activeBooks[bk]?1:0.5}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:4,height:18,borderRadius:2,background:activeBooks[bk]?info.color:C.border}}/>
                <div>
                  <div style={{fontSize:13,fontWeight:500}}>{info.name}</div>
                  <div style={{fontSize:10,color:C.ts}}>{info.tier}</div>
                </div>
              </div>
              <div style={{width:42,height:24,borderRadius:12,
                background:activeBooks[bk]?info.color:C.border,
                position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{position:"absolute",top:3,
                  left:activeBooks[bk]?20:3,
                  width:18,height:18,borderRadius:"50%",
                  background:"#fff",transition:"left 0.2s",
                  boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
              </div>
            </div>
          ))}
        </GlassCard>
      </Section>

      {/* API info */}
      <Section title="Live data — API-tilkoblinger">
        <GlassCard sx={{padding:"14px"}}>
          {[
            {name:"The Odds API",     url:"the-odds-api.com",        status:"mock",   desc:"Live bookmaker odds"},
            {name:"FBref / Opta",     url:"fbref.com",               status:"mock",   desc:"Spillerstatistikk"},
            {name:"Polymarket API",   url:"gamma-api.polymarket.com",status:"mock",   desc:"Prediction markets"},
            {name:"StatsBomb",        url:"statsbomb.com/api",       status:"inactive",desc:"Event-data"},
            {name:"Betfair Exchange", url:"api.betfair.com",         status:"inactive",desc:"Exchange odds"},
          ].map((api,i,arr)=>(
            <div key={api.name} style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",padding:"9px 0",
              borderBottom:i<arr.length-1?`1px solid ${C.border}22`:"none"}}>
              <div>
                <div style={{fontSize:13,fontWeight:500}}>{api.name}</div>
                <div style={{fontSize:10,color:C.accent}}>{api.url}</div>
                <div style={{fontSize:10,color:C.ts}}>{api.desc}</div>
              </div>
              <Badge
                color={api.status==="active"?C.green:api.status==="mock"?C.amber:C.ts}
                bg={api.status==="active"?C.greenDim:api.status==="mock"?C.amberDim:C.surfaceUp}
                sx={{fontSize:9,marginTop:2}}>
                {api.status==="active"?"● LIVE":api.status==="mock"?"◐ MOCK":"○ OFF"}
              </Badge>
            </div>
          ))}
        </GlassCard>
      </Section>

      {/* Save button */}
      <button onClick={save} style={{width:"100%",padding:"14px",borderRadius:12,
        border:"none",cursor:"pointer",fontSize:15,fontWeight:700,
        background:saved?C.green:`linear-gradient(135deg,${C.accent},${C.purple})`,
        color:saved?"#000":"#fff",transition:"background 0.3s",
        boxShadow:`0 8px 24px ${C.accent}22`}}>
        {saved?"✓ Lagret!":"Lagre innstillinger"}
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PORTFOLIO SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const PortfolioScreen = () => {
  const won = PORTFOLIO.openBets.filter(b=>b.status==="won");
  const open = PORTFOLIO.openBets.filter(b=>b.status==="open");

  return (
    <div style={{padding:"16px",paddingBottom:80}}>
      {/* Bankroll overview */}
      <GlassCard sx={{padding:"18px",marginBottom:20,
        background:`linear-gradient(135deg,rgba(10,132,255,0.12),rgba(191,90,242,0.08))`}}>
        <div style={{fontSize:11,color:C.ts,fontWeight:600,letterSpacing:"0.08em",marginBottom:6}}>TOTAL BANKROLL</div>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:36,fontWeight:900,
          color:C.tp,letterSpacing:"-0.03em"}}>
          NOK {PORTFOLIO.totalBankroll.toLocaleString()}
        </div>
        <div style={{display:"flex",gap:16,marginTop:12,flexWrap:"wrap"}}>
          {[
            {l:"Eksponert",v:`NOK ${PORTFOLIO.atRisk}`,c:C.amber},
            {l:"ROI",       v:`+${(PORTFOLIO.history.roi*100).toFixed(1)}%`,c:C.green},
            {l:"CLV",       v:`+${(PORTFOLIO.history.clv*100).toFixed(1)}%`,c:C.purple},
            {l:"Profitt",   v:`NOK ${PORTFOLIO.history.totalProfit}`,c:C.green},
          ].map(s=>(
            <div key={s.l}>
              <div style={{fontSize:10,color:C.ts}}>{s.l}</div>
              <Mono color={s.c} size={14}>{s.v}</Mono>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Open bets */}
      <Section title={`Åpne bets (${open.length})`}>
        {open.map(bet=><BetRow key={bet.id} bet={bet}/>)}
      </Section>

      {/* Won */}
      {won.length>0&&(
        <Section title="✅ Nylig vunnet">
          {won.map(bet=><BetRow key={bet.id} bet={bet}/>)}
        </Section>
      )}

      {/* Stats */}
      <Section title="📊 Statistikk">
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[
            {l:"Totalt bets",  v:PORTFOLIO.history.totalBets, c:C.tp},
            {l:"Vunnet",       v:PORTFOLIO.history.wonBets,   c:C.green},
            {l:"Win rate",     v:pct(PORTFOLIO.history.wonBets/PORTFOLIO.history.totalBets), c:C.accent},
          ].map(s=>(
            <StatPill key={s.l} label={s.l} value={s.v} color={s.c}/>
          ))}
        </div>
      </Section>

      {/* Kelly guide */}
      <Section title="Kelly Criterion Kalkulator">
        <GlassCard sx={{padding:"14px"}}>
          <div style={{fontSize:12,color:C.ts,lineHeight:1.6}}>
            Anbefalt maksimal eksponering (25% Kelly):{" "}
            <Mono color={C.accent} size={12}>NOK {r2(PORTFOLIO.totalBankroll*0.03)}</Mono>{" "}
            per bet (3% bankroll).
            Med +14.2% gjennomsnittlig EV er optimal diversifisering 15–20 bets simultant.
          </div>
        </GlassCard>
      </Section>
    </div>
  );
};

const BetRow = ({bet}) => (
  <GlassCard sx={{padding:"12px 14px",marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:12,color:C.ts,marginBottom:2}}>{bet.match}</div>
        <div style={{fontWeight:600,fontSize:14}}>{bet.bet}</div>
        <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center"}}>
          <Badge color={bet.ev>0?C.green:C.red} bg={bet.ev>0?C.greenDim:C.redDim} sx={{fontSize:9}}>
            EV {sign(bet.ev)}{pct(bet.ev)}
          </Badge>
          <Mono color={C.ts} size={11}>@ {bet.odds}</Mono>
        </div>
      </div>
      <div style={{textAlign:"right"}}>
        <Mono color={bet.status==="won"?C.green:C.accent} size={15}>
          {bet.status==="won"?`+NOK ${bet.result-bet.stake}`:`NOK ${bet.stake}`}
        </Mono>
        <div style={{fontSize:10,color:C.ts,marginTop:2}}>
          {bet.status==="won"?"Vunnet":`Pot: NOK ${bet.potential}`}
        </div>
      </div>
    </div>
  </GlassCard>
);

// ═══════════════════════════════════════════════════════════════════════════════
// AI COPILOT
// ═══════════════════════════════════════════════════════════════════════════════
const COPILOT_REPLIES = {
  arb: `⚡ **Live Arbitrage**\n\nJeg finner **${ARB_OPS.filter(a=>a.margin>0).length} aktive arbitrage-muligheter** akkurat nå:\n\n• Arsenal vs Chelsea 1X2: **+5.82% garantert** (NOK 58 per NOK 1000)\n  → Arsenal @ 2.18 (Pinnacle), Draw @ 3.60 (Betfair), Chelsea @ 4.80 (Coolbet)\n\nHandle raskt — odds-vinduer lukkes typisk innen 2–5 minutter.`,
  ev: `🎯 **Top +EV Bets i dag**\n\n1. **Haaland Anytime** @ 2.10 — EV +22% — Konfidans 8.9/10\n   Modell: 58% sannsynlighet, fair odds 1.72\n\n2. **Kane Over 1.5 SoT** @ 1.85 — EV +19% — Konfidans 8.1/10\n\n3. **Vinicius Jr Anytime** @ 2.40 — EV +13%\n\nKelly anbefalt: 1–2.5% bankroll per bet.`,
  hedge: `🛡 **Hedge-strategi**\n\nFor en typisk bet på **Norge vinner** kan jeg beregne:\n\n**Full hedge:** Lay på Betfair Exchange for nullrisiko\n**Partial hedge (50%):** Halverer risiko, beholder 50% upside\n**Double chance:** Dekker to av tre utfall\n\nÅpne en spesifikk VM-kamp for automatisk hedge-kalkulator.`,
  portfolio: `📊 **Porteføljebygging NOK 1000**\n\n**Anbefalt fordeling:**\n• 3× høy-EV props @ 150 NOK = 450 NOK (Haaland, Kane, Mbappé)\n• 1× ARB position @ 300 NOK = +17.46 NOK garantert\n• 2× VM-bets @ 125 NOK = 250 NOK (Brasil, Argentina)\n\n**Forventet EV:** +14.2% = +142 NOK\n**Kelly-justert risiko:** Maks 3% per bet`,
  default: `Hei! Jeg er din AI-betting-copilot. Jeg kan hjelpe med:\n\n• **"Vis beste arbitrage"** — live ARB-muligheter\n• **"Finn +EV bets"** — høyeste expected value\n• **"Bygg portefølje 1000 NOK"** — Kelly-optimert\n• **"Hedge min bet"** — risikokalkulator\n• **"VM-analyse"** — VM 2026 spesialanalyse`,
};

const Copilot = () => {
  const [messages,setMessages] = useState([
    { role:"ai", text:COPILOT_REPLIES.default }
  ]);
  const [input,setInput] = useState("");
  const [loading,setLoading] = useState(false);
  const bottomRef = useRef(null);

  const send = async (txt) => {
    if (!txt.trim()) return;
    const userMsg = { role:"user", text:txt };
    setMessages(m=>[...m,userMsg]);
    setInput("");
    setLoading(true);
    await new Promise(r=>setTimeout(r,800));
    const lower = txt.toLowerCase();
    const reply = lower.includes("arb")||lower.includes("arbitrage") ? COPILOT_REPLIES.arb
      : lower.includes("ev")||lower.includes("value")||lower.includes("anbefal") ? COPILOT_REPLIES.ev
      : lower.includes("hedge")||lower.includes("sikr") ? COPILOT_REPLIES.hedge
      : lower.includes("porteføl")||lower.includes("1000")||lower.includes("bankroll") ? COPILOT_REPLIES.portfolio
      : COPILOT_REPLIES.default;
    setMessages(m=>[...m,{ role:"ai", text:reply }]);
    setLoading(false);
  };

  useEffect(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),[messages]);

  const quickPrompts = [
    "Beste arbitrage nå", "Finn +EV bets", "Bygg portefølje 1000 NOK", "VM-analyse"
  ];

  const renderText = (text) => text.split("\n").map((line,i) => {
    const boldLine = line.replace(/\*\*(.*?)\*\*/g, (_,t)=>`<strong>${t}</strong>`);
    return <div key={i} style={{marginBottom:3}} dangerouslySetInnerHTML={{__html:boldLine||"&nbsp;"}}/>;
  });

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 116px)"}}>
      {/* Chat messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
        {messages.map((msg,i)=>(
          <div key={i} style={{
            display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",
            animation:"fadeIn 0.2s ease",
          }}>
            <div style={{
              maxWidth:"88%", padding:"11px 14px", borderRadius:14,
              background:msg.role==="user"
                ? `linear-gradient(135deg,${C.accent},#0055cc)`
                : C.glass,
              border:msg.role==="ai"?`1px solid ${C.glassBorder}`:"none",
              fontSize:13, lineHeight:1.55, color:C.tp,
              borderBottomRightRadius:msg.role==="user"?4:14,
              borderBottomLeftRadius:msg.role==="ai"?4:14,
            }}>
              {msg.role==="ai"&&(
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                  <div style={{width:20,height:20,borderRadius:6,
                    background:`linear-gradient(135deg,${C.accent},${C.purple})`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>⚡</div>
                  <span style={{fontSize:10,color:C.ts,fontWeight:600}}>OddsArb AI</span>
                </div>
              )}
              {renderText(msg.text)}
            </div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",gap:6,padding:"10px 14px",background:C.glass,
            borderRadius:14,border:`1px solid ${C.glassBorder}`,width:"fit-content",animation:"fadeIn 0.2s"}}>
            {[0,1,2].map(i=>(
              <div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.ts,
                animation:`pulse 1s ease-in-out ${i*0.2}s infinite`}}/>
            ))}
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Quick prompts */}
      <div style={{padding:"0 16px 8px",display:"flex",gap:6,overflowX:"auto"}}>
        {quickPrompts.map(p=>(
          <button key={p} onClick={()=>send(p)} style={{
            padding:"6px 12px",borderRadius:20,whiteSpace:"nowrap",cursor:"pointer",
            border:`1px solid ${C.border}`,background:C.surfaceUp,color:C.ts,fontSize:11,fontWeight:500,
          }}>{p}</button>
        ))}
      </div>

      {/* Input */}
      <div style={{padding:"8px 16px",borderTop:`1px solid ${C.border}`,
        display:"flex",gap:8,alignItems:"center",
        paddingBottom:"max(8px,env(safe-area-inset-bottom))"}}>
        <input
          value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&send(input)}
          placeholder="Spør om ARB, EV, hedge, portefølje…"
          style={{flex:1,padding:"11px 14px",background:C.surfaceUp,border:`1px solid ${C.border}`,
            borderRadius:12,color:C.tp,fontSize:14,outline:"none"}}/>
        <button onClick={()=>send(input)} disabled={!input.trim()||loading} style={{
          width:42,height:42,borderRadius:12,border:"none",cursor:"pointer",
          background:input.trim()&&!loading?`linear-gradient(135deg,${C.accent},#0055cc)`:C.border,
          color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
        }}>↑</button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MATCH DETAIL + HEDGE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
const MatchDetail = ({match,onBack,loading,lastRefresh,onRefresh,nextIn}) => {
  const [tab,setTab]     = useState("hedge");
  const [selBet,setSelBet] = useState(null);
  const [stake,setStake] = useState(500);
  const [selMkt,setSelMkt] = useState(match.markets[0]);
  const isLive = match.status==="live";

  useEffect(()=>{
    const upd = match.markets.find(m=>m.id===selMkt?.id);
    if(upd) setSelMkt(upd);
  },[match]);

  const suggestions = useMemo(()=>
    selBet ? buildSuggestions(selBet, match.markets, stake) : [],
    [selBet, match.markets, stake]);

  const tabs = [{id:"hedge",icon:"🛡",label:"Hedge"},{id:"odds",icon:"📊",label:"Odds"},{id:"arb",icon:"⚡",label:"Arb"}];

  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh"}}>
      {/* Header */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,
        position:"sticky",top:56,zIndex:20}}>
        <div style={{padding:"10px 16px 0"}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:C.ts,
            cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:4,marginBottom:8,padding:0}}>
            ← Alle kamper
          </button>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontSize:10,color:C.ts,letterSpacing:"0.05em",marginBottom:5}}>
                {match.tournament} · {match.round}{match.group?` · GR.${match.group}`:""}
              </div>
              <div style={{fontSize:20,fontWeight:800,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:26}}>{match.he}</span>{match.homeTeam}
              </div>
              {isLive&&match.score?(
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:26,fontWeight:900,
                  color:C.red,margin:"4px 0",display:"flex",alignItems:"center",gap:10}}>
                  <LiveDot/>{match.score.home} – {match.score.away}
                  <Badge color={C.red} bg={C.redDim}>{match.liveMinute}'</Badge>
                </div>
              ):(
                <div style={{color:C.ts,fontSize:12,margin:"3px 0"}}>vs</div>
              )}
              <div style={{fontSize:20,fontWeight:800,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:26}}>{match.ae}</span>{match.awayTeam}
              </div>
            </div>
            {isLive&&match.xg&&(
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:C.ts,marginBottom:2}}>xG</div>
                <Mono color={C.cyan} size={14}>{match.xg.home.toFixed(2)}</Mono>
                <div style={{fontSize:9,color:C.tm}}>–</div>
                <Mono color={C.purple} size={14}>{match.xg.away.toFixed(2)}</Mono>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:10}}>
            {match.markets.map(m=>(
              <button key={m.id} onClick={()=>setSelMkt(m)} style={{
                padding:"5px 12px",borderRadius:20,whiteSpace:"nowrap",cursor:"pointer",
                border:`1px solid ${selMkt.id===m.id?C.accent:C.border}`,
                background:selMkt.id===m.id?C.accentDim:"transparent",
                color:selMkt.id===m.id?C.accent:C.ts,fontSize:12,fontWeight:500,
              }}>{m.label}</button>
            ))}
          </div>
        </div>
        {/* Refresh bar */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 16px",
          background:C.surfaceUp,borderTop:`1px solid ${C.border}`,fontSize:11,color:C.tm}}>
          {loading?<Spinner/>:<span style={{fontSize:10,color:C.green}}>●</span>}
          <span style={{flex:1}}>{loading?"Oppdaterer…":`${ageSec(lastRefresh)}s siden`}
            {nextIn!==null&&!loading&&<span style={{color:C.tm}}> · neste {nextIn}s</span>}</span>
          <button onClick={onRefresh} style={{background:"none",border:"none",color:C.accent,fontSize:11,cursor:"pointer",padding:0}}>↺</button>
        </div>
      </div>

      <div style={{flex:1,padding:"16px",paddingBottom:80,overflowY:"auto"}}>
        {/* ── HEDGE ── */}
        {tab==="hedge"&&(
          selBet?(
            <div>
              <Section title="Ditt bet">
                <GlassCard sx={{padding:"12px 14px",marginBottom:6,
                  borderColor:`${C.accent}44`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{selBet.label}</div>
                      <div style={{fontSize:11,color:BOOKS[selBet.bookmaker]?.color||C.ts}}>
                        {BOOKS[selBet.bookmaker]?.name||selBet.bookmaker} · {selMkt.label}
                      </div>
                    </div>
                    <Mono color={C.accent} size={22}>{selBet.decimalOdds.toFixed(2)}</Mono>
                  </div>
                </GlassCard>
                <button onClick={()=>setSelBet(null)} style={{background:"none",border:"none",
                  color:C.ts,fontSize:11,cursor:"pointer",padding:"4px 0"}}>× Fjern</button>
              </Section>
              <Section title="Innsats (NOK)">
                <input type="number" value={stake} onChange={e=>setStake(Math.max(1,Number(e.target.value)))}
                  style={{width:"100%",padding:"11px 13px",background:C.surfaceUp,border:`1px solid ${C.border}`,
                    borderRadius:8,color:C.tp,fontSize:15,fontFamily:"'JetBrains Mono',monospace",outline:"none"}}/>
                <div style={{fontSize:11,color:C.ts,marginTop:5}}>
                  Potensiell gevinst: <Mono size={11} color={C.tp}>NOK {r2(stake*selBet.decimalOdds)}</Mono>
                </div>
              </Section>
              <Section title={`${suggestions.length} Hedge-forslag`}>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {suggestions.map((s,i)=><HedgeCard2 key={i} s={s}/>)}
                </div>
              </Section>
            </div>
          ):(
            <div style={{textAlign:"center",padding:"50px 20px"}}>
              <div style={{fontSize:44,marginBottom:16}}>🛡</div>
              <div style={{fontSize:17,fontWeight:700,marginBottom:10}}>Velg et bet</div>
              <div style={{fontSize:13,color:C.ts,marginBottom:24}}>Gå til Odds-fanen og velg en odds for automatisk hedge-analyse</div>
              <button onClick={()=>setTab("odds")} style={{padding:"12px 28px",borderRadius:10,
                border:`1px solid ${C.accent}`,background:C.accentDim,color:C.accent,
                fontSize:14,fontWeight:700,cursor:"pointer"}}>Gå til Odds →</button>
            </div>
          )
        )}

        {/* ── ODDS ── */}
        {tab==="odds"&&(
          <Section title={`${selMkt.label} — Alle bookmakers`}>
            <div style={{fontSize:12,color:C.ts,marginBottom:12}}>Trykk en odds for å velge bet og få hedge-forslag</div>
            {selMkt.outcomes.map(oc=>{
              const sortedOdds = [...oc.odds].sort((a,b)=>b.decimalOdds-a.decimalOdds);
              const bestOdd = sortedOdds[0];
              const isSel = selBet?.outcomeId===oc.id&&selBet?.marketId===selMkt.id;
              return (
                <div key={oc.id} style={{borderRadius:10,overflow:"hidden",marginBottom:10,
                  border:`1px solid ${isSel?C.accent:C.border}`,
                  background:isSel?C.accentDim:C.surfaceUp}}>
                  <div style={{padding:"10px 14px",background:isSel?"rgba(10,132,255,0.08)":C.surface,
                    borderBottom:`1px solid ${C.border}22`,
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontWeight:700,fontSize:14}}>{oc.label}</span>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{fontSize:10,color:C.ts}}>{pct(1/bestOdd.decimalOdds)}</span>
                      <Badge color={C.green} bg={C.greenDim} sx={{fontSize:10}}>
                        Best: {bestOdd.decimalOdds.toFixed(2)}
                      </Badge>
                    </div>
                  </div>
                  {sortedOdds.map((od,i)=>{
                    const bm = BOOKS[od.bookmaker];
                    const isBest = i===0;
                    const isThisSel = selBet?.bookmaker===od.bookmaker&&selBet?.outcomeId===oc.id&&selBet?.marketId===selMkt.id;
                    return (
                      <div key={od.bookmaker+i}
                        onClick={()=>setSelBet({...od,label:oc.label,outcomeId:oc.id,marketId:selMkt.id})}
                        style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                          padding:"9px 14px",cursor:"pointer",
                          background:isThisSel?C.accentDim:isBest?C.greenDim:"transparent",
                          borderBottom:i<sortedOdds.length-1?`1px solid ${C.border}11`:"none",
                          transition:"background 0.1s"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:3,height:16,borderRadius:2,background:bm?.color||C.ts}}/>
                          <span style={{fontSize:13,color:isBest?C.tp:C.ts,fontWeight:isBest?600:400}}>
                            {bm?.name||od.bookmaker}
                          </span>
                          {bm?.tier==="sharp"&&<Badge color={C.amber} bg={C.amberDim} sx={{fontSize:9}}>SHARP</Badge>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <Mono color={isThisSel?C.accent:isBest?C.green:C.tp} size={15}>
                            {od.decimalOdds.toFixed(2)}
                          </Mono>
                          {isThisSel&&<span style={{color:C.accent,fontSize:12}}>✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </Section>
        )}

        {/* ── ARB ── */}
        {tab==="arb"&&(
          <div>
            <Section title="Innsats">
              <input type="number" value={stake} onChange={e=>setStake(Math.max(1,Number(e.target.value)))}
                style={{width:"100%",padding:"11px 13px",background:C.surfaceUp,border:`1px solid ${C.border}`,
                  borderRadius:8,color:C.tp,fontSize:15,fontFamily:"'JetBrains Mono',monospace",outline:"none"}}/>
            </Section>
            {match.markets.map(mkt=>{
              const bMap = bestOdds(mkt.outcomes);
              if(Object.keys(bMap).length<2) return null;
              const arb = calcArb(bMap,stake);
              return (
                <Section key={mkt.id} title={mkt.label}>
                  <GlassCard sx={{padding:"13px 14px",marginBottom:8,
                    borderColor:arb.isArb?`${C.green}44`:arb.isNearArb?`${C.amber}44`:C.glassBorder}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:arb.isArb?10:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {arb.isArb&&<Badge color={C.green} bg={C.greenDim}>⚡ ARB</Badge>}
                        {arb.isNearArb&&<Badge color={C.amber} bg={C.amberDim}>≈ NEAR</Badge>}
                        {!arb.isArb&&!arb.isNearArb&&<Badge color={C.tm} bg="transparent">Ingen arb</Badge>}
                        <Mono color={arb.isArb?C.green:arb.isNearArb?C.amber:C.red} size={12}>
                          {pct(Math.abs(arb.tip-1))} {arb.tip<1?"under":"over"} 100%
                        </Mono>
                      </div>
                      {arb.isArb&&<Mono color={C.green} size={16}>+NOK {arb.gProfit}</Mono>}
                    </div>
                    {arb.isArb&&arb.legs.map((leg,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",
                        padding:"7px 0",borderTop:`1px solid ${C.green}22`,fontSize:13}}>
                        <div>
                          <span style={{fontWeight:600}}>{leg.label}</span>
                          <span style={{color:BOOKS[leg.bookmaker]?.color||C.ts,fontSize:11,marginLeft:6}}>
                            ({BOOKS[leg.bookmaker]?.name||leg.bookmaker})
                          </span>
                        </div>
                        <Mono color={C.accent} size={13}>{leg.stake} NOK @ {leg.decimalOdds.toFixed(2)}</Mono>
                      </div>
                    ))}
                  </GlassCard>
                </Section>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom tabs */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,
        background:C.surface,borderTop:`1px solid ${C.border}`,
        display:"flex",zIndex:50,maxWidth:480,margin:"0 auto",
        paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1,padding:"10px 0",background:"none",border:"none",cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:2,
            color:tab===t.id?C.accent:C.ts,
            borderTop:`2px solid ${tab===t.id?C.accent:"transparent"}`,transition:"color 0.15s"}}>
            <span style={{fontSize:18}}>{t.icon}</span>
            <span style={{fontSize:10,fontWeight:tab===t.id?700:400}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const HedgeCard2 = ({s}) => {
  const {kind,label,isArb,isNearArb,arb,hedge,cand,tipTwo,marketLabel,outcomeLabel} = s;
  const [open,setOpen] = useState(isArb||isNearArb);
  const bc = isArb?C.green:isNearArb?C.amber:C.accent;
  const bb = isArb?C.greenDim:isNearArb?C.amberDim:C.accentDim;

  if (kind==="full_arb"&&arb) return (
    <GlassCard sx={{overflow:"hidden",borderColor:`${C.green}44`}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"13px 14px",cursor:"pointer",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
            <Badge color={C.green} bg={C.greenDim}>⚡ FULL ARB</Badge>
            <span style={{fontSize:13,fontWeight:700,color:C.green}}>+{pct(arb.margin)}</span>
          </div>
          <div style={{fontSize:12,color:C.ts}}>{s.mkt.label} · {arb.legs.length} ben</div>
        </div>
        <div style={{textAlign:"right"}}>
          <Mono color={C.green} size={20}>+{arb.gProfit}</Mono>
          <div style={{fontSize:10,color:C.ts}}>NOK garantert</div>
        </div>
      </div>
      {open&&(
        <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.green}22`}}>
          {arb.legs.map((leg,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",
              padding:"8px 0",borderBottom:i<arb.legs.length-1?`1px solid ${C.green}22`:"none"}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{leg.label}</div>
                <div style={{fontSize:11,color:BOOKS[leg.bookmaker]?.color||C.ts}}>
                  {BOOKS[leg.bookmaker]?.name||leg.bookmaker} @ {leg.decimalOdds.toFixed(2)}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <Mono color={C.accent} size={14}>NOK {leg.stake}</Mono>
                <div style={{fontSize:10,color:C.ts}}>→ {leg.potReturn}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );

  if (!hedge) return null;
  return (
    <GlassCard sx={{overflow:"hidden",borderColor:`${bc}33`}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"12px 14px",cursor:"pointer",
        display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:4}}>
            <Badge color={bc} bg={bb}>{label}</Badge>
            <span style={{fontSize:11,color:C.ts,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{marketLabel}</span>
          </div>
          <div style={{fontSize:15,fontWeight:700}}>{outcomeLabel}</div>
          <div style={{fontSize:11,color:BOOKS[cand?.bookmaker]?.color||C.ts}}>
            {BOOKS[cand?.bookmaker]?.name||cand?.bookmaker} @ {cand?.decimalOdds.toFixed(2)}
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:10,color:C.ts,marginBottom:2}}>Hedge</div>
          <Mono color={bc} size={17}>NOK {hedge.hStake}</Mono>
          <div style={{fontSize:10,color:hedge.worstCase>=0?C.green:C.red,marginTop:2}}>
            Verste: {sign(hedge.worstCase)}NOK {hedge.worstCase}
          </div>
        </div>
      </div>
      {open&&(
        <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.border}22`}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:12}}>
            {[
              {l:"Din innsats",  v:`NOK ${hedge.origStake}`, c:C.tp},
              {l:"Hedge",        v:`NOK ${hedge.hStake}`,    c:bc},
              {l:"Totalt",       v:`NOK ${hedge.total}`,     c:C.tp},
              {l:"Impl.sum",     v:pct(tipTwo||0),           c:isArb?C.green:isNearArb?C.amber:C.ts},
            ].map(stat=>(
              <div key={stat.l} style={{background:C.surfaceUp,borderRadius:8,padding:"9px 11px"}}>
                <div style={{fontSize:10,color:C.ts,marginBottom:2}}>{stat.l}</div>
                <Mono color={stat.c} size={14}>{stat.v}</Mono>
              </div>
            ))}
          </div>
          <PLChart scenarios={hedge.scenarios} total={hedge.total}/>
        </div>
      )}
    </GlassCard>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [nav,       setNav]       = useState(NAV.ONBOARD);
  const [matches,   setMatches]   = useState(WC_MATCHES);
  const [selMatch,  setSelMatch]  = useState(null);
  const [selPlayer, setSelPlayer] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [lastRefresh,setLast]     = useState(new Date().toISOString());
  const [nextIn,    setNextIn]    = useState(30);
  const [dataSource,setDataSource]= useState("mock");
  const [apiError,  setApiError]  = useState(null);
  const [quota,     setQuota]     = useState(null);
  const intervalRef = useRef(null);
  const countRef    = useRef(null);

  const refresh = useCallback(async()=>{
    setLoading(true); setNextIn(null);
    try {
      const result = await fetchLiveOdds();
      if ((result.source==="the_odds_api" || result.source==="the_odds_api_proxy") && result.matches.length) {
        setMatches(result.matches);
        setDataSource(result.source);
        setQuota(result.quota);
        setApiError(null);
      } else {
        setMatches(prev=>simulateLive(prev));
        setDataSource("mock");
        setApiError("Ingen API-nøkkel funnet. Bruker demo-data.");
      }
    } catch (err) {
      setMatches(prev=>simulateLive(prev));
      setDataSource("mock");
      setApiError(err?.message || "Kunne ikke hente live odds.");
    }
    setLast(new Date().toISOString());
    setLoading(false);
    let t=30; setNextIn(t);
    clearInterval(countRef.current);
    countRef.current=setInterval(()=>{t--;setNextIn(t);if(t<=0)clearInterval(countRef.current);},1000);
  },[]);

  useEffect(()=>{
    if(nav===NAV.ONBOARD) return;
    refresh();
    intervalRef.current=setInterval(refresh,30000);
    return()=>{clearInterval(intervalRef.current);clearInterval(countRef.current);};
  },[refresh,nav]);

  useEffect(()=>{
    if(selMatch){
      const u=matches.find(m=>m.id===selMatch.id);
      if(u)setSelMatch(u);
    }
  },[matches]);

  const recommendations = useMemo(()=>recommendMatches(matches),[matches]);

  // Onboarding: render full-screen without shell
  if (nav===NAV.ONBOARD) return (
    <div style={{maxWidth:480,margin:"0 auto"}}>
      <style>{css}</style>
      <Onboarding onDone={()=>setNav(NAV.DASHBOARD)}/>
    </div>
  );

  const showMatchDetail  = selMatch && (nav===NAV.WC||nav===NAV.DASHBOARD);
  const showPlayerDetail = selPlayer && nav===NAV.PLAYER_DETAIL;
  const showSettings     = nav===NAV.SETTINGS;
  const showMovers       = nav===NAV.MOVERS;
  const showEV           = nav===NAV.EV;

  // Which nav item is "active" for bottom bar highlight
  const bottomNavActive = [
    NAV.SETTINGS, NAV.MOVERS, NAV.EV, NAV.PLAYER_DETAIL
  ].includes(nav) ? null : nav;

  const navItems = [
    {id:NAV.DASHBOARD, icon:"🏠", label:"Home"},
    {id:NAV.WC,        icon:"⚽", label:"VM 2026"},
    {id:NAV.PROPS,     icon:"🎯", label:"Props"},
    {id:NAV.ARB,       icon:"⚡", label:"Arb"},
    {id:NAV.COPILOT,   icon:"🤖", label:"AI"},
    {id:NAV.PORTFOLIO, icon:"📊", label:"Port."},
  ];

  const goBack = () => {
    if (showMatchDetail)  { setSelMatch(null); return; }
    if (showPlayerDetail) { setSelPlayer(null); setNav(NAV.PROPS); return; }
    if (showSettings||showMovers||showEV) { setNav(NAV.DASHBOARD); return; }
  };

  const needsBack = showMatchDetail||showPlayerDetail||showSettings||showMovers||showEV;

  // Dynamic title
  const title = showMatchDetail ? `${selMatch.he} vs ${selMatch.ae}`
    : showPlayerDetail ? selPlayer.player
    : showSettings ? "Innstillinger"
    : showMovers   ? "Market Movers"
    : showEV       ? "+EV Bet Finder"
    : "OddsArb Pro";

  const subtitle = showMatchDetail ? "LIVE HEDGE INTELLIGENCE"
    : showPlayerDetail ? "AI PROP ANALYSIS"
    : "SPORTS BETTING INTELLIGENCE";

  return (
    <div style={{minHeight:"100vh",background:C.bg,maxWidth:480,margin:"0 auto",position:"relative"}}>
      <style>{css}</style>

      {/* Live ticker */}
      <Ticker movers={MOVERS}/>

      {/* Top nav bar */}
      <div style={{position:"sticky",top:22,zIndex:100,
        background:`${C.surface}ee`,backdropFilter:"blur(20px)",
        borderBottom:`1px solid ${C.border}`,
        padding:"0 16px",height:56,display:"flex",alignItems:"center",gap:10}}>
        {needsBack&&(
          <button onClick={goBack} style={{background:"none",border:"none",color:C.ts,
            cursor:"pointer",fontSize:22,padding:"0 6px 0 0",lineHeight:1,flexShrink:0}}>←</button>
        )}
        <div style={{width:30,height:30,borderRadius:8,flexShrink:0,
          background:`linear-gradient(135deg,${C.accent},${C.purple})`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>⚡</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,fontSize:14,letterSpacing:"-0.03em",lineHeight:1.1,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {title}
          </div>
          <div style={{fontSize:9,color:C.ts,letterSpacing:"0.08em"}}>{subtitle}</div>
        </div>
        {loading&&<Spinner size={14}/>}
        {/* Settings + Movers quick-access */}
        {!showSettings&&!needsBack&&(
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <button onClick={()=>setNav(NAV.MOVERS)} style={{background:"none",border:"none",
              color:C.ts,cursor:"pointer",fontSize:16,padding:0,lineHeight:1}}>📈</button>
            <button onClick={()=>setNav(NAV.SETTINGS)} style={{background:"none",border:"none",
              color:C.ts,cursor:"pointer",fontSize:16,padding:0,lineHeight:1}}>⚙️</button>
          </div>
        )}
        {!needsBack&&(
          <div style={{fontSize:10,color:C.tm,flexShrink:0}}>{Object.keys(BOOKS).length} books</div>
        )}
      </div>

      {/* Main content */}
      <div style={{paddingBottom:64}}>
        {/* Sub-screens (no bottom nav highlight) */}
        {showSettings ? (
          <SettingsScreen onBack={()=>setNav(NAV.DASHBOARD)}/>
        ) : showMovers ? (
          <MoversScreen/>
        ) : showEV ? (
          <EVScreen recommendations={recommendations}/>
        ) : showMatchDetail ? (
          <MatchDetail match={selMatch} onBack={()=>setSelMatch(null)}
            loading={loading} lastRefresh={lastRefresh} onRefresh={refresh} nextIn={nextIn}/>
        ) : showPlayerDetail ? (
          <PlayerDetailScreen player={selPlayer} onBack={()=>{setSelPlayer(null);}}/>
        ) : nav===NAV.DASHBOARD ? (
          <Dashboard
            matches={matches}
            recommendations={recommendations}
            dataSource={dataSource}
            apiError={apiError}
            quota={quota}
            onSelectMatch={m=>{setSelMatch(m);setNav(NAV.WC);}}
            onNav={setNav}/>
        ) : nav===NAV.WC ? (
          <WorldCupScreen matches={matches} onSelect={setSelMatch}
            loading={loading} onRefresh={refresh} nextIn={nextIn}/>
        ) : nav===NAV.PROPS ? (
          <PropsScreen onSelectPlayer={p=>{setSelPlayer(p);setNav(NAV.PLAYER_DETAIL);}}/>
        ) : nav===NAV.ARB ? (
          <ArbScreen/>
        ) : nav===NAV.COPILOT ? (
          <Copilot/>
        ) : nav===NAV.PORTFOLIO ? (
          <PortfolioScreen/>
        ) : null}
      </div>

      {/* Bottom navigation */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,
        background:`${C.surface}f0`,backdropFilter:"blur(24px)",
        borderTop:`1px solid ${C.border}`,display:"flex",zIndex:50,
        maxWidth:480,margin:"0 auto",
        paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>{setNav(n.id);setSelMatch(null);setSelPlayer(null);}} style={{
            flex:1,padding:"8px 0",background:"none",border:"none",cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:1,
            color:bottomNavActive===n.id?C.accent:C.ts,
            borderTop:`2px solid ${bottomNavActive===n.id?C.accent:"transparent"}`,
            transition:"color 0.15s"}}>
            <span style={{fontSize:16}}>{n.icon}</span>
            <span style={{fontSize:9,fontWeight:bottomNavActive===n.id?700:400}}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
