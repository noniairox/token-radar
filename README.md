# Token Radar — Build the best token launch radar

[![make.fun](https://make.fun/c/token-radar-01/badge)](https://make.fun/c/token-radar-01)
[![make.fun bounty](https://make.fun/c/token-radar-01/badge.svg)](https://make.fun/c/token-radar-01)
[![token-radar-01 on make.fun](https://make.fun/c/token-radar-01/cover)](https://make.fun/c/token-radar-01)

A program (`main.ts`, Node 22, standard library only) that reads a sealed snapshot of
the protocol universe and writes a web dashboard ranking the protocols that record no
token yet by what their launch would be worth — each with the steps to farm it.

## What it does

- Reads `/input/snapshot.json` (758 DefiLlama protocols, 40 on the watchlist).
- Ranks **every** rankable pre-token protocol — the 40 watchlist protocols **plus**
  the 138 pre-token protocols below the $50M floor and 20 more above it that the
  watchlist leaves out (198 rows). The watchlist's own exclusion rule (no wrapped,
  staked or bridged product, no version-marker name, no exchange prefix) is applied
  **without** its TVL floor: the floor is where the search starts, not where it stops.
- Scores each row from the snapshot's own figures only — no hand-kept list of names:

  `implied = round(TVL × 0.30 × (1 + clamp(7d, −50, 150)/100 × 0.60) × (0.60 + min(age, 1095)/1095 × 0.40) × (1 + 0.04 × min(chains−1, 5)))`

  TVL is the size of the prize, seven-day growth is momentum, age with no token is
  patience, and chain breadth is farming surface. Re-run on a future snapshot and
  the board re-ranks by itself — that is how the radar finds airdrops that do not
  exist yet, early.
- Writes a farm plan for every row (6 steps, each with a cost and a time), derived
  from the protocol's category, chains, TVL and age.
- Sets the live-token protocols aside with their market caps shown, never mixed
  into the ranking.

## The dashboard

A static page with no network: a top-3 spotlight, a sortable/filterable board
(search, category, chain, min TVL, watchlist-only, early-finds-only, pagination),
a live-token view, a detail drawer for every protocol (model breakdown with a
recompute check + farm plan), and a model sandbox — move the base-multiple or
growth-weight slider and the board re-ranks live.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and
`out/dossier.json` (via `vendor/makefun-board.ts`, the kit's copy byte for byte).

## Files

- `main.ts` — entrypoint: snapshot in, board + data + dashboard + dossier out
- `lib/model.ts` — the radar-2 model, the farm plans, the snapshot parser
- `vendor/makefun-board.ts` — make.fun's dossier library (kit copy, unchanged)
- `dashboard/` — `index.html`, `app.css`, `app.js` (no network, no framework)
- `screenshots/` — the board, a protocol detail view, a filtered view

## Notes

A protocol that records no token may still have one its record does not carry.
Implied value is this entry's own claim — never a price, and never a promise that
a token will launch.
