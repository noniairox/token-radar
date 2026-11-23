# Token Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/noniairox/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/noniairox/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Pre-token protocols, ranked by what a token would be worth if one launched today.

## What it is

Token Radar reads a sealed snapshot of the protocol universe (DefiLlama, 14 November 2026) and
ranks every pre-token protocol by an **implied value** — the market cap its token would plausibly
carry if it launched today. It covers all 40 protocols on the snapshot's watchlist, plus 160
pre-token protocols found below the watchlist floor, and lists live-token protocols separately at
the market's own value.

## How the implied value is computed (model radar-2)

```
implied = TVL × 0.30 × (1 + 0.6 × clamped 7-day growth) × (0.5 + 0.5 × min(age, 3y) / 3y)
```

- **TVL × 0.30** — the base. A token's market cap usually sits at 0.2–0.4× the value its
  protocol secures; 0.30 is the middle of that band.
- **Growth** — the 7-day TVL change, clamped to −50%…+100%, weighted 0.6. A growing protocol
  gains users, so its token would price higher.
- **Age without a token** — 0.5 at launch, rising to 1.0 after three years. A protocol that has
  run for years with no token has a longer record to price and a larger unclaimed audience.

The same formula scores every row. No protocol name is ever special-cased: the ranking comes
only from the snapshot's own figures — TVL, 7-day growth and time without a token.

## How to farm it

Every protocol on the board carries an 8-step farm plan: concrete actions with what each costs
in dollars or gas and how long it takes. Open a row to see its plan, including the model's
breakdown for that protocol.

## Run it

Node 22, standard library only. The program reads the sealed snapshot and writes the board,
the dashboard data, and the dossier the judge reads:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

The dashboard is a static page with no network: `dashboard/index.html` reads `data.js` beside it.

## License

MIT. See [LICENSE](LICENSE).
