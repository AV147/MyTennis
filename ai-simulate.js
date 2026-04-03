// ===== HEADLESS SIMULATION ENGINE =====
// Shared helpers + dispatcher. Uses SimAIv1 / SimAIv2 for card selection.

const SIM_NUM_POINTS = 10000;
const SIM_MAX_TURNS  = 400;
const SIM_ENGINES    = { 1: SimAIv1, 2: SimAIv2, 3: SimAIv3 };  // v3 registered by ai-simulate-v3.js

// Per-side version selection (defaults to v2 vs v2)
let simVersionP0 = 2;
let simVersionP1 = 2;

// ───────────────────────────────────────────────────────────
// SHARED PURE HELPERS
// ───────────────────────────────────────────────────────────

function simIsCardPlayable(card, player, incPower, incCard) {
  const respondingToDropshot = incCard && incCard.dropshot && player.position !== 'Net';
  if (incPower === 0  && card.type !== 'serve') return false;
  if (incPower > 0   && card.type === 'serve')  return false;
  if (player.position === 'Net' && !card.volley && !card.overhead && !respondingToDropshot) return false;
  if (card.volley  && player.position !== 'Net') return false;
  if (card.overhead && (!incCard || !incCard.smashable)) return false;
  return true;
}

function simCalcProb(player, card, incPower, incSpin, incCard, powershotBonus,
                     bonusPower = 0, bonusSpin = 0) {
  const isRespondingToDropshot = incCard && incCard.dropshot;
  const effectivelyInPos = player.inPosition || (card.approach && isRespondingToDropshot);
  const { v2 } = getFatigueIncrements();
  const fatigue = player.fatigue + (!effectivelyInPos && v2 > 0 ? v2 : 0);

  const outgoing = (card.power + bonusPower) - (card.spin + bonusSpin);
  const incoming = card.type !== 'serve' ? incPower + incSpin + powershotBonus : 0;
  const guided   = card.guided ? 1 : 0;
  const total    = incoming + outgoing + guided;
  const numDice  = effectivelyInPos ? 2 : 1;
  const d3Range  = card.complex ? [1, 2, 3] : [0];

  let success = 0, combos = 0;
  for (const d3 of d3Range) {
    if (numDice === 2) {
      for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
        combos++;
        const isCritS = (a === 6 && b === 6);
        const isCritF = (a === 1 && b === 1);
        if (isCritS || (!isCritF && 6 + a + b - fatigue - d3 >= total)) success++;
      }
    } else {
      for (let a = 1; a <= 6; a++) {
        combos++;
        if (a === 6 || (a !== 1 && 6 + a - fatigue - d3 >= total)) success++;
      }
    }
  }
  return combos > 0 ? success / combos : 0;
}

function simOppDifficulty(card, player, opponent) {
  const dir = card.direction || 'neutral';
  let oop = false;
  if (dir === 'line')  oop = player.position === opponent.position;
  if (dir === 'cross') oop = player.position !== opponent.position;

  if (card.targetOpposite) {
    oop = opponent.position !== 'Net'; // always wrong corner unless at net
  } else if (card.target) {
    oop = opponent.position !== card.target;
  }

  if (!card.targetOpposite && opponent.position === 'Net' && dir !== 'neutral') oop = false;
  if (card.volley && opponent.position === 'Net') oop = false;
  if (card.antiNet && opponent.position === 'Net') oop = true;
  if (card.dropshot && opponent.position !== 'Net') oop = true;
  const difficulty = card.power + card.spin + (card.powershot ? 3.5 : 0);
  return { oop, difficulty };
}

function simNetRetreat(player, opponent, incPower, incSpin, incCard, powershotBonus) {
  if (player.hand.length === 0) return;
  const target = (opponent.position === 'BR' || opponent.position === 'BL')
    ? opponent.position : 'BR';

  let idx = player.hand.findIndex(c => c.overhead);
  if (idx === -1) idx = player.hand.findIndex(c => c.color === 'green');
  if (idx === -1) {
    let lowest = Infinity;
    player.hand.forEach((c, i) => {
      const p = simCalcProb(player, c, incPower, incSpin, incCard, powershotBonus);
      if (p < lowest) { lowest = p; idx = i; }
    });
  }
  const discarded = player.hand.splice(idx, 1)[0];
  player.discard.push(discarded);
  player.position = target;
  player.inPosition = true;
}

function simApplyPositioning(player, card, incCard) {
  const respondingToDropshot = incCard && incCard.dropshot;
  if (respondingToDropshot && player.positionBeforeDropshot !== null) {
    player.position = 'Net';
    player.positionBeforeDropshot = null;
  } else if (card.approach) {
    player.position = 'Net';
  } else if (!player.inPosition && card.type === 'return' && !player.wasLobbed) {
    player.position = player.position === 'BR' ? 'BL' : 'BR';
  }
  if (player.inPosition && player.wasLobbed) player.wasLobbed = false;
}

function simApplyOpponentPositioning(card, shooter, opponent) {
  const { oop } = simOppDifficulty(card, shooter, opponent);
  opponent.inPosition = !oop;
  if (card.antiNet && card.smashable && opponent.position === 'Net') {
    opponent.position = shooter.position;
    opponent.inPosition = false;
    opponent.wasLobbed = true;
  }
}

// ───────────────────────────────────────────────────────────
// PLAYER STATE
// ───────────────────────────────────────────────────────────

function simClonePlayer(playerIndex, startPos) {
  return {
    name: `P${playerIndex + 1}`,
    fatigue: 0,
    deck: shuffle([...PLAYER_DECKS[playerIndex]]),
    discard: [],
    hand: [],
    position: startPos,
    inPosition: true,
    positionBeforeDropshot: null,
    wasLobbed: false,
    temporaryRemovedServes: []
  };
}

function simDrawCard(player, skipFatigue = false) {
  if (player.deck.length === 0) {
    if (player.discard.length === 0) return;
    player.deck = shuffle([...player.discard]);
    player.discard = [];
  }
  player.hand.push(player.deck.pop());
  if (!skipFatigue) {
    const { v2 } = getFatigueIncrements();
    if (v2 > 0) player.fatigue += v2;
  }
}

function simDrawToTarget(player, target) {
  while (player.hand.length < target) simDrawCard(player);
}

// ───────────────────────────────────────────────────────────
// SINGLE POINT SIMULATION
// engineP0 / engineP1: SimAIv1 or SimAIv2
// ───────────────────────────────────────────────────────────

function simRunPoint(p0, p1, servingPlayerIdx, startPos, engineP0, engineP1) {
  const players  = [p0, p1];
  const engines  = [engineP0, engineP1];
  let incPower = 0, incSpin = 0, incCard = null, powershotBonus = 0;
  let serveAttempt = 1;
  let current = servingPlayerIdx;
  const cardsPlayed = [];

  // Reset per-point state — deck/discard persist across points within a game.
  players.forEach(p => {
    p.discard.push(...p.hand, ...(p.temporaryRemovedServes || []));
    p.hand = [];
    p.temporaryRemovedServes = [];
    p.inPosition = true;
    p.position = startPos;
    p.fatigue = 0;
    p.positionBeforeDropshot = null;
    p.wasLobbed = false;
    // No reshuffle here — deck carries over from the previous point.
  });

  const server   = players[servingPlayerIdx];
  const returner = players[1 - servingPlayerIdx];

  // Server: pull serves from deck first, then from discard
  for (let i = server.deck.length - 1; i >= 0; i--) {
    if (server.deck[i].type === 'serve') server.hand.push(...server.deck.splice(i, 1));
  }
  for (let i = server.discard.length - 1; i >= 0; i--) {
    if (server.discard[i].type === 'serve') server.hand.push(...server.discard.splice(i, 1));
  }
  while (server.hand.length < HAND_SIZE) {
    if (server.deck.length === 0) { server.deck = shuffle([...server.discard]); server.discard = []; }
    server.hand.push(server.deck.pop());
  }

  // Returner: temporarily remove serves from deck first, then from discard
  for (let i = returner.deck.length - 1; i >= 0; i--) {
    if (returner.deck[i].type === 'serve')
      returner.temporaryRemovedServes.push(...returner.deck.splice(i, 1));
  }
  for (let i = returner.discard.length - 1; i >= 0; i--) {
    if (returner.discard[i].type === 'serve')
      returner.temporaryRemovedServes.push(...returner.discard.splice(i, 1));
  }
  while (returner.hand.length < HAND_SIZE) {
    if (returner.deck.length === 0) { returner.deck = shuffle([...returner.discard]); returner.discard = []; }
    returner.hand.push(returner.deck.pop());
  }

  for (let turn = 0; turn < SIM_MAX_TURNS; turn++) {
    const player   = players[current];
    const opponent = players[1 - current];
    const engine   = engines[current];

    // Draw up to engine target if below it
    simDrawToTarget(player, engine.DRAW_TARGET);

    if (!player.hand.some(c => simIsCardPlayable(c, player, incPower, incCard))) {
      return { winner: 1 - current, cardsPlayed };
    }

    const decision = engine.selectCard(player, opponent, incPower, incSpin, incCard, powershotBonus, serveAttempt);
    if (!decision) return { winner: 1 - current, cardsPlayed };

    const { cardIdx, discardIdx, discardColor } = decision;

    // Remove played card
    const playedCard = player.hand.splice(cardIdx, 1)[0];
    player.discard.push(playedCard);

    // Apply active discard
    let bonusPowerForShot = 0, bonusSpinForShot = 0, pendingGreenDraw = false;
    if (discardIdx !== -1 && playedCard.type !== 'serve') {
      const adj = discardIdx > cardIdx ? discardIdx - 1 : discardIdx;
      if (adj >= 0 && adj < player.hand.length) {
        const discardCard = player.hand.splice(adj, 1)[0];
        player.discard.push(discardCard);
        if (discardColor === 'red')   bonusPowerForShot = 2;
        if (discardColor === 'blue')  bonusSpinForShot  = 1;
        if (discardColor === 'green') pendingGreenDraw  = true;
      }
    }

    // Track dropshot response origin (mirrors game.js pre-play block)
    if (incCard && incCard.dropshot && player.position !== 'Net') {
      player.positionBeforeDropshot = player.position;
    }

    // Approach+dropshot overrides OOP penalty — capture wasInPos AFTER this override
    if (playedCard.approach && incCard && incCard.dropshot) player.inPosition = true;
    const wasInPos = player.inPosition;

    const result = resolveShot(player, playedCard, incPower, incSpin, incCard, powershotBonus,
                               bonusPowerForShot, bonusSpinForShot);
    powershotBonus = 0;

    const { v1, v2 } = getFatigueIncrements();
    cardsPlayed.push({ playerIdx: current, cardName: playedCard.name });

    if (result.success) {
      // Fatigue only on success or normal miss — not on serve fault (mirrors game.js)
      player.fatigue += v1;
      if (!wasInPos) player.fatigue += v2;

      if (playedCard.powershot) powershotBonus = Math.floor(Math.random() * 6) + 1;
      if (pendingGreenDraw) simDrawCard(player, true); // free draw — no fatigue
      if (playedCard.type === 'serve') serveAttempt = 1;

      simApplyPositioning(player, playedCard, incCard);
      simApplyOpponentPositioning(playedCard, player, opponent);
      // Note: lob repositioning is fully handled inside simApplyOpponentPositioning

      incPower = result.shotPower;
      incSpin  = result.shotSpin;
      incCard  = playedCard;

      if (player.position === 'Net') {
        if (typeof engine.selectMove === 'function') {
          const mv = engine.selectMove(player, opponent, incPower, incSpin, incCard,
                                       powershotBonus, serveAttempt, false, 0, 0, 0);
          if (mv && mv.position && player.hand.length > 0) {
            let sacrificeIdx = 0, lowest = Infinity;
            player.hand.forEach((c, i) => {
              const p = simCalcProb(player, c, incPower, incSpin, incCard, powershotBonus);
              if (p < lowest) { lowest = p; sacrificeIdx = i; }
            });
            player.discard.push(player.hand.splice(sacrificeIdx, 1)[0]);
            player.position   = mv.position;
            player.inPosition = true;
          }
        } else {
          simNetRetreat(player, opponent, incPower, incSpin, incCard, powershotBonus);
        }
      }

      current = 1 - current;
    } else {
      if (pendingGreenDraw) simDrawCard(player, true); // free draw — no fatigue
      if (playedCard.type === 'serve') {
        if (serveAttempt === 1) { serveAttempt = 2; continue; } // no fatigue on serve fault
        else return { winner: 1 - current, cardsPlayed };
      }
      // Normal miss — fatigue applies
      player.fatigue += v1;
      if (!wasInPos) player.fatigue += v2;
      return { winner: 1 - current, cardsPlayed };
    }
  }

  return { winner: 0, cardsPlayed };
}

// ───────────────────────────────────────────────────────────
// RUNNER
// ───────────────────────────────────────────────────────────

function runSimulation() {
  const btn = document.getElementById('sim-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Running…';

  setTimeout(() => {
    const engineP0 = SIM_ENGINES[simVersionP0];
    const engineP1 = SIM_ENGINES[simVersionP1];
    const cardStats = {};

    const p0 = simClonePlayer(0, 'BR');
    const p1 = simClonePlayer(1, 'BR');
    let servingPlayer = 0;
    // Tennis game score tracking — reshuffle when a game ends
    let simP0Points = 0, simP1Points = 0;

    for (let pt = 0; pt < SIM_NUM_POINTS; pt++) {
      const startPos = pt % 2 === 0 ? 'BR' : 'BL';
      const { winner, cardsPlayed } = simRunPoint(p0, p1, servingPlayer, startPos, engineP0, engineP1);

      // Track points within this game
      if (winner === 0) simP0Points++; else simP1Points++;

      // Check if this tennis game is over (4 points, 2 clear)
      if ((simP0Points >= 4 || simP1Points >= 4) &&
          Math.abs(simP0Points - simP1Points) >= 2) {
        simP0Points = 0; simP1Points = 0;
        servingPlayer = 1 - servingPlayer;
        // Shuffle decks for the new tennis game
        [p0, p1].forEach(p => {
          p.deck = shuffle([...p.deck, ...p.discard, ...p.hand, ...(p.temporaryRemovedServes || [])]);
          p.discard = []; p.hand = []; p.temporaryRemovedServes = [];
        });
      }

      const seenThisPoint = new Set();
      for (const { playerIdx, cardName } of cardsPlayed) {
        const key = `${playerIdx}:${cardName}`;
        if (seenThisPoint.has(key)) continue;
        seenThisPoint.add(key);
        if (!cardStats[cardName]) cardStats[cardName] = { played: 0, won: 0 };
        cardStats[cardName].played++;
        if (playerIdx === winner) cardStats[cardName].won++;
      }
    }

    btn.disabled = false;
    btn.textContent = `▶ Simulate ${SIM_NUM_POINTS.toLocaleString()} Points`;
    showSimResults(cardStats, simVersionP0, simVersionP1);
  }, 20);
}

// ───────────────────────────────────────────────────────────
// VERSION SELECTOR UI (rendered into #sim-version-controls)
// ───────────────────────────────────────────────────────────

function renderSimControls() {
  const el = document.getElementById('sim-version-controls');
  if (!el) return;

  const versions = Object.keys(SIM_ENGINES).map(Number);

  function verToggle(playerLabel, currentVer, setFn) {
    const btns = versions.map(v =>
      `<button class="ai-ver-btn ${currentVer === v ? 'ai-ver-active' : ''}"
         onclick="${setFn}(${v})">v${v}</button>`
    ).join('');
    return `<span style="font-size:12px;font-weight:bold;color:#555;">${playerLabel}:</span>
            <span class="ai-version-toggle">${btns}</span>`;
  }

  el.innerHTML = `
    <div class="sim-ver-row">
      ${verToggle('P1 AI', simVersionP0, 'setSimVersionP0')}
      <span style="color:#aaa;font-size:12px;">vs</span>
      ${verToggle('P2 AI', simVersionP1, 'setSimVersionP1')}
    </div>`;
}

function setSimVersionP0(v) { simVersionP0 = v; renderSimControls(); }
function setSimVersionP1(v) { simVersionP1 = v; renderSimControls(); }

// ───────────────────────────────────────────────────────────
// RESULTS MODAL
// ───────────────────────────────────────────────────────────

function showSimResults(cardStats, verP0, verP1) {
  const existing = document.getElementById('sim-modal');
  if (existing) existing.remove();

  const rows = Object.entries(cardStats).map(([name, s]) => ({
    name, played: s.played, won: s.won,
    pct: s.played > 0 ? (s.won / s.played * 100) : 0
  }));
  rows.sort((a, b) => b.pct - a.pct);

  const tableRows = rows.map(r => `
    <tr>
      <td>${r.name}</td>
      <td>${r.played.toLocaleString()}</td>
      <td>${r.won.toLocaleString()}</td>
      <td style="font-weight:bold;color:${r.pct >= 55 ? '#27ae60' : r.pct <= 45 ? '#c0392b' : '#333'}">
        ${r.pct.toFixed(1)}%
      </td>
    </tr>`).join('');

  const modal = document.createElement('div');
  modal.id = 'sim-modal';
  modal.innerHTML = `
    <div class="sim-overlay" onclick="if(event.target===this)this.parentElement.remove()">
      <div class="sim-dialog">
        <div class="sim-header">
          <strong>📊 Simulation — ${SIM_NUM_POINTS.toLocaleString()} Points (P1 AI v${verP0} vs P2 AI v${verP1})</strong>
          <button class="sim-close" onclick="document.getElementById('sim-modal').remove()">✕</button>
        </div>
        <p class="sim-subtitle">Sorted by win % (descending). Only points where card was played, not just discarded.</p>
        <div class="sim-table-wrap">
          <table class="sim-table">
            <thead>
              <tr>
                <th>Card Name</th>
                <th>Points Played</th>
                <th>Points Won</th>
                <th>Win %</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
}
