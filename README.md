# Chronoloop

A time-loop incremental game that runs in the browser. It's plain HTML, CSS and JavaScript, with no build step and no dependencies.

## Play

Open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## How it works

- **The loop.** Each loop is a short countdown, starting at 20 seconds. Gather **Moments** by hand and buy **Timepieces** that produce them. Every 25 of a kind doubles that timepiece's output.
- **Rewind.** When the clock runs out, or when you rewind early, the moments you earned that loop turn into **Echoes**: `√(moments / 100) × multipliers`. A loop that runs out on its own always gives at least 1 echo. Timepieces and moments reset; echoes stay.
- **Echo upgrades.** Spend echoes on longer loops, stronger gathering, production multipliers, a starting stash, deeper timepieces, starting timepieces (Muscle Memory), auto-buyers (Clockwork Hands) and larger echo gains.
- **Echo of Self.** Your busiest loop is recorded. Once you unlock this upgrade, your past self replays those gathers in every later loop.
- **Paradox.** After earning 100K echoes in one timeline, collapse it. You lose your echoes and echo upgrades and gain **Paradox Shards**. Shards permanently multiply echo gains and buy upgrades for time speed, production and longer loops, let you keep upgrades, and unlock a seventh timepiece.
- **Feats.** There are 24 achievements, each worth +3% production.

The game saves to `localStorage` every 10 seconds and keeps running offline for up to 2 hours. You can export and import saves in Options.

**Keys:** `Space` gather · `R` rewind · `1`–`7` buy timepieces.
