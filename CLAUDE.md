# MyTennis — CLAUDE.md

Card-based tennis game with one ruleset shipped in two formats: a **Telegram
Mini App** (vs AI, deployed from `main` to https://av147.github.io/MyTennis/)
and a future **printed board game** (PvP). Everything digital must stay
replicable by hand with physical components: cards + d6/d3 dice, no hidden math.

**Product language is Russian** (UI, log, RULES.md). Code, comments and commit
messages are English. Internal keys stay ASCII: `player.position` and court
`data-id`s are `'BR' | 'BL' | 'Net'` — only display text goes through
`formatPosition()` (Справа/Слева/Сетка). Never translate the keys.

## Entry points

| File | Role |
|---|---|
| `index.html` | Telegram/mobile release build. Mobile-first layout (`styles-app.css` only), AI v3 auto-play, loads `v3-weights-pure.json`, log ticker + overlay, `window.DICE_SINGLE_TARGET` routes every dice roll into the one visible block. |
| `old_index.html` | Debug build (`styles.css`). Full controls: AI version toggles, 10k-point simulation, v3 training panel, per-player dice. `AI_HAND_HIDDEN` (config.js) is overridden to false here so AI hands stay visible. |

`render.js`, `game.js`, `dice-visuals.js`, `deck-utils.js`, `ai-*.js` are
**shared by both pages** — check both after editing them.

## Core game files

- `game.js` — rally/point/game flow, `playCard()`, scoring, the game log.
- `shot-resolution.js` — dice check. **Crit rule: [6,6]/[1,1] apply on TWO dice
  only; a single die (out of position) has no crits.** This rule lives in FOUR
  places that must stay in sync: `resolveShot()` plus the probability
  estimators in `ai-v1.js`, `ai-v2.js`, `ai-v3.js` (`v3CalcProb`) and
  `ai-simulate.js` (`simCalcProb`).
- `positioning.js` — direction/target math, `updatePositionAfterOutOfPositionReturn`.
- `decks.js` — `CARD_LIBRARY` + `PLAYER_DECKS` (68 cards/player).
- `config.js` — `HAND_SIZE`, `FATIGUE_SYSTEM` (V2 active: fatigue per draw /
  per out-of-position shot), `AI_HAND_HIDDEN`.

### Positioning invariants (hard-won bug fixes — do not regress)

In `playCard()` success branch, order matters:
1. **Sideways out-of-position return**: the player runs to the opposite corner
   BEFORE the trajectory and the opponent's out-of-position check are computed
   (contact happens at the new corner). Its log line ("смещается") precedes the
   shot line.
2. **Approach / dropshot response**: hit from where they stand, advance to the
   net AFTER trajectory + opponent-OOP are computed.
3. **Lob** (`antiNet && smashable`) pushes a net opponent to
   `shotOriginPosition` (the corner the shooter actually struck from), NOT
   `player.position` — they differ when the lob answers a dropshot.
4. A card marked for active discard cannot be played itself (guard at top of
   `playCard`, disabled "🔒 В сбросе" button in render.js).

Balance decision (confirmed by the designer): red discard (+2 power) raising
your own difficulty by 2 while blue (+1 spin) lowers it by 1 is intentional —
bigger bonus costs more. Don't "fix" it.

## AI

- `ai-v1/v2.js` — heuristics (v2 = safe baseline opponent, never nets).
- `ai-v3.js` — policy network 83→64→32, **LayerNorm + LeakyReLU**, four heads
  (draw/card/discard/move). `index.html` ships `v3-weights-pure.json` (~59% vs
  v2); `v3-weights-style.json` is a compatible spare set. **Weight sets that
  predate the LayerNorm/LeakyReLU network are incompatible** — same
  dimensions, silently meaningless values (the legacy `v3-weights(4).json`
  was deleted for this reason; it survives in git history). Same trap for any
  stale `v3weights` in browser localStorage (old_index auto-loads it; press
  "↺ Reset" once).
- Training: `node train-v3-node.js --points 300000 --out v3-weights-pure.json`
  (~7 min; `--resume` chains phases, `--opp v2|self`, `--profile pure|style`).
  Rewards are **outcome-only ±1** — do NOT reintroduce per-hit rewards
  (`R_HIT` paid most for the safest cards and taught net-camping). Watch
  `maxLogit` (saturation) and per-head entropy in the progress output; the
  draw head still saturates early (known issue).
- `ai-simulate*.js` — headless engines mirroring game.js. **Any rules change in
  game.js must be mirrored there** (that divergence has bitten before: sim
  didn't charge reposition fatigue; eval ignored the draw head). Known
  divergence: sim computes approach/dropshot opponent-OOP from the net, game
  from the back position (minor, affects training fidelity only).

## Workflows

- **Dev server**: use the Browser-pane preview with `.claude/launch.json`
  (`tennis-static-server`, `npx serve` on :8080). Don't run servers via Bash.
- **Deploy**: GitHub Pages serves `main` at av147.github.io/MyTennis/. Merging
  to main auto-deploys (~1 min build). Telegram WebView caches hard — swipe
  the mini-app away to force reload. Weights JSON must stay committed.
- **Git**: work on a short-lived branch, PR to `main` via `gh`, merge-commit,
  delete branch. The user prefers ONE working branch; don't multiply
  experiment branches unless asked (pending: `experiment/move-cost-variants`,
  a MOVE_COST_MODE flag awaiting a design decision).
- **Testing game logic**: browser tabs are polluted by the auto-playing AI and
  leftover globals (`markedCardIndices`, incoming state). For anything
  deterministic, load the modules in a Node `vm` context with DOM stubs and a
  seeded `Math.random` (see the pattern in `train-v3-node.js`; stub
  `drawShotLine/render/displayDiceRoll/document`). In a live tab, first
  `aiSetAutoMode(0,false); aiSetAutoMode(1,false)` and reset
  `markedCardIndices=[-1,-1]`.
- **Mobile layout budget**: target 360×690 CSS px with zero scroll in normal
  play; body uses `min-height:100dvh` + vertical scroll as the safety valve.
  The reposition window (pass button + move buttons on every card) is the
  worst case — check it before shipping layout changes.

## Rules documentation

`RULES.md` is the rules source of truth and the design basis for the printed
rulebook (real-tennis primer first, then mechanics, then the card appendix).
**Update it whenever mechanics change** — e.g. the crit rule and positioning
fixes above are already reflected there. A styled one-pager artifact exists;
regenerate it together with RULES.md when rules shift.
