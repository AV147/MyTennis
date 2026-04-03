// ===== AI v3: Neural Network Policy =====
// Feedforward net: 83 inputs → [64] → [32] → 4 output heads
// draw (sigmoid) | card (5-softmax) | discard (6-softmax) | move (4-softmax)

// ── Network dimensions ─────────────────────────────────────────────────────
const V3_N_INPUT = 83;
const V3_H1      = 64;
const V3_H2      = 32;
const V3_N_CARD  = 5;   // HAND_SIZE slots
const V3_N_DISC  = 6;   // none + 5 sorted hand slots
const V3_N_MOVE  = 4;   // none + BL + BR + Net
const V3_MOVE_POSITIONS = ['none', 'BL', 'BR', 'Net'];

// ── Weight storage (row-major Float32Arrays) ───────────────────────────────
const v3W = {
  W1:     null, b1:     null,   // [N_INPUT×H1], [H1]
  W2:     null, b2:     null,   // [H1×H2],      [H2]
  W_draw: null, b_draw: null,   // [H2×1],        [1]
  W_card: null, b_card: null,   // [H2×N_CARD],  [N_CARD]
  W_disc: null, b_disc: null,   // [H2×N_DISC],  [N_DISC]
  W_move: null, b_move: null,   // [H2×N_MOVE],  [N_MOVE]
};

// ── Weight initialisation (He / ReLU) ──────────────────────────────────────
function v3HeInit(size, fanIn) {
  const std = Math.sqrt(2.0 / fanIn);
  const arr = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const u1 = Math.max(1e-10, Math.random());
    arr[i] = std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random());
  }
  return arr;
}

function v3InitWeights() {
  v3W.W1     = v3HeInit(V3_N_INPUT * V3_H1, V3_N_INPUT);
  v3W.b1     = new Float32Array(V3_H1);
  v3W.W2     = v3HeInit(V3_H1 * V3_H2, V3_H1);
  v3W.b2     = new Float32Array(V3_H2);
  v3W.W_draw = v3HeInit(V3_H2, V3_H2);
  v3W.b_draw = new Float32Array(1);
  v3W.W_card = v3HeInit(V3_H2 * V3_N_CARD, V3_H2);
  v3W.b_card = new Float32Array(V3_N_CARD);
  v3W.W_disc = v3HeInit(V3_H2 * V3_N_DISC, V3_H2);
  v3W.b_disc = new Float32Array(V3_N_DISC);
  v3W.W_move = v3HeInit(V3_H2 * V3_N_MOVE, V3_H2);
  v3W.b_move = new Float32Array(V3_N_MOVE);
}
v3InitWeights();

// ── Pure math ──────────────────────────────────────────────────────────────
function v3Linear(x, W, b, inSz, outSz) {
  const y = new Float32Array(outSz);
  for (let j = 0; j < outSz; j++) {
    let s = b[j];
    for (let i = 0; i < inSz; i++) s += x[i] * W[i * outSz + j];
    y[j] = s;
  }
  return y;
}

function v3Relu(x) {
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] > 0 ? x[i] : 0;
  return y;
}

function v3Softmax(logits, mask) {
  const n = logits.length;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const l = (mask && !mask[i]) ? -1e9 : logits[i];
    if (l > max) max = l;
  }
  const e = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    e[i] = Math.exp(((mask && !mask[i]) ? -1e9 : logits[i]) - max);
    sum += e[i];
  }
  for (let i = 0; i < n; i++) e[i] /= sum;
  return e;
}

function v3Sigmoid(x) { return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, x)))); }

function v3Sample(probs) {
  let r = Math.random(), cum = 0;
  for (let i = 0; i < probs.length; i++) { cum += probs[i]; if (r < cum) return i; }
  return probs.length - 1;
}

function v3Argmax(arr) {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
  return best;
}

// ── Forward pass ───────────────────────────────────────────────────────────
function v3Forward(features) {
  const h1_pre = v3Linear(features, v3W.W1, v3W.b1, V3_N_INPUT, V3_H1);
  const h1     = v3Relu(h1_pre);
  const h2_pre = v3Linear(h1, v3W.W2, v3W.b2, V3_H1, V3_H2);
  const h2     = v3Relu(h2_pre);
  return {
    h1_pre, h1, h2_pre, h2,
    draw_raw:  v3Linear(h2, v3W.W_draw, v3W.b_draw, V3_H2, 1),
    card_raw:  v3Linear(h2, v3W.W_card, v3W.b_card, V3_H2, V3_N_CARD),
    disc_raw:  v3Linear(h2, v3W.W_disc, v3W.b_disc, V3_H2, V3_N_DISC),
    move_raw:  v3Linear(h2, v3W.W_move, v3W.b_move, V3_H2, V3_N_MOVE),
  };
}

// ── Hand sorting (stable slot assignment) ─────────────────────────────────
// Returns array of HAND_SIZE items: {card, origIdx} | null
function v3SortHand(hand, isPlayable) {
  function catScore(c) {
    if (c.type === 'serve')    return 0;
    if (c.volley)              return 4;
    if (c.overhead || c.powershot || c.approach || c.power >= 5) return 3;
    if (c.dropshot)            return 2;
    return 1;
  }
  const items = hand.map((card, origIdx) => ({ card, origIdx }));
  items.sort((a, b) => {
    const ap = isPlayable(a.card) ? 1 : 0, bp = isPlayable(b.card) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const ac = catScore(a.card), bc = catScore(b.card);
    if (ac !== bc) return bc - ac;
    if (a.card.power !== b.card.power) return b.card.power - a.card.power;
    return b.card.spin - a.card.spin;
  });
  while (items.length < HAND_SIZE) items.push(null);
  return items.slice(0, HAND_SIZE);
}

// ── Feature encoder ────────────────────────────────────────────────────────
// opts: { position, inPosition, fatigue, wasLobbed, handSize, deckSize,
//         discardSize, hand, sortedItems,
//         incomingPower, incomingSpin, powershotBonus, serveAttempt, incomingCard,
//         oppPosition, oppInPosition, oppFatigue, oppWasLobbed,
//         myPoints, oppPoints, myGames, oppGames, isServing,
//         isPlayable(card)→bool, calcProb(card)→float, calcOppDiff(card)→{oop,difficulty} }
function v3EncodeState(opts) {
  const { position, inPosition, fatigue, wasLobbed,
          handSize, deckSize, discardSize, hand, sortedItems,
          incomingPower, incomingSpin, powershotBonus, serveAttempt, incomingCard,
          oppPosition, oppInPosition, oppFatigue, oppWasLobbed,
          myPoints, oppPoints, myGames, oppGames, isServing,
          isPlayable, calcProb, calcOppDiff } = opts;

  const f = new Float32Array(V3_N_INPUT);
  let i = 0;

  // ── Self state (8) ─────────────────────────────────────────────────────
  f[i++] = position === 'BR'  ? 1 : 0;
  f[i++] = position === 'BL'  ? 1 : 0;
  f[i++] = position === 'Net' ? 1 : 0;
  f[i++] = inPosition ? 1 : 0;
  f[i++] = Math.min(fatigue / 10, 1);
  f[i++] = wasLobbed ? 1 : 0;
  f[i++] = handSize / HAND_SIZE;
  const total = deckSize + discardSize + handSize;
  f[i++] = total > 0 ? deckSize / total : 0;

  // ── Incoming shot (9) ──────────────────────────────────────────────────
  f[i++] = Math.min(incomingPower  / 12, 1);
  f[i++] = Math.min(incomingSpin   / 4,  1);
  f[i++] = Math.min(powershotBonus / 6,  1);
  f[i++] = serveAttempt === 2 ? 1 : 0;
  f[i++] = incomingCard && incomingCard.dropshot  ? 1 : 0;
  f[i++] = incomingCard && incomingCard.smashable ? 1 : 0;
  f[i++] = incomingCard && incomingCard.antiNet   ? 1 : 0;
  f[i++] = incomingCard && incomingCard.guided    ? 1 : 0;
  f[i++] = incomingPower === 0 ? 1 : 0;

  // ── Opponent state (6) ─────────────────────────────────────────────────
  f[i++] = oppPosition === 'BR'  ? 1 : 0;
  f[i++] = oppPosition === 'BL'  ? 1 : 0;
  f[i++] = oppPosition === 'Net' ? 1 : 0;
  f[i++] = oppInPosition ? 1 : 0;
  f[i++] = Math.min(oppFatigue / 10, 1);
  f[i++] = oppWasLobbed ? 1 : 0;

  // ── Score context (5) ──────────────────────────────────────────────────
  f[i++] = Math.min((myPoints  || 0) / 4,  1);
  f[i++] = Math.min((oppPoints || 0) / 4,  1);
  f[i++] = Math.min((myGames   || 0) / 10, 1);
  f[i++] = Math.min((oppGames  || 0) / 10, 1);
  f[i++] = isServing ? 1 : 0;

  // ── Hand bag-of-features (10) ──────────────────────────────────────────
  let cRed = 0, cBlue = 0, cGreen = 0, cVolley = 0, cApproach = 0;
  let cDrop = 0, cPlay = 0, hasOvh = 0, sumPow = 0, sumSpin = 0;
  for (const card of hand) {
    if (card.color === 'red')   cRed++;
    if (card.color === 'blue')  cBlue++;
    if (card.color === 'green') cGreen++;
    if (card.volley)   cVolley++;
    if (card.approach) cApproach++;
    if (card.dropshot) cDrop++;
    if (card.overhead) hasOvh = 1;
    if (isPlayable(card)) { cPlay++; sumPow += card.power; sumSpin += card.spin; }
  }
  f[i++] = cRed     / HAND_SIZE;
  f[i++] = cBlue    / HAND_SIZE;
  f[i++] = cGreen   / HAND_SIZE;
  f[i++] = cVolley  / HAND_SIZE;
  f[i++] = cApproach / HAND_SIZE;
  f[i++] = cDrop    / HAND_SIZE;
  f[i++] = cPlay    / HAND_SIZE;
  f[i++] = cPlay > 0 ? Math.min(sumPow  / cPlay / 12, 1) : 0;
  f[i++] = cPlay > 0 ? Math.min(sumSpin / cPlay / 4,  1) : 0;
  f[i++] = hasOvh;

  // ── Per-card slot features (5 × 9 = 45) ───────────────────────────────
  for (let slot = 0; slot < HAND_SIZE; slot++) {
    const item = sortedItems[slot];
    if (!item) { i += 9; continue; }
    const { card } = item;
    const playable = isPlayable(card);
    const prob = playable ? calcProb(card) : 0;
    const { oop, difficulty } = calcOppDiff(card);
    f[i++] = playable ? 1 : 0;
    f[i++] = prob;
    f[i++] = Math.min(card.power / 12, 1);
    f[i++] = Math.min(card.spin  / 4,  1);
    f[i++] = card.color === 'red'   ? 1 : 0;
    f[i++] = card.color === 'blue'  ? 1 : 0;
    f[i++] = card.color === 'green' ? 1 : 0;
    f[i++] = oop ? 1 : 0;
    f[i++] = Math.min(difficulty / 20, 1);
  }

  if (i !== V3_N_INPUT) console.error(`v3EncodeState: expected ${V3_N_INPUT}, got ${i}`);
  return f;
}

// ── Weight serialisation ───────────────────────────────────────────────────
function v3WeightsToJSON() {
  const obj = {};
  for (const [k, arr] of Object.entries(v3W)) obj[k] = Array.from(arr);
  return JSON.stringify(obj);
}
function v3WeightsFromJSON(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  for (const k of Object.keys(v3W)) {
    if (obj[k]) v3W[k] = new Float32Array(obj[k]);
  }
}
function v3SaveToLocalStorage() {
  try { localStorage.setItem('v3weights', v3WeightsToJSON()); return true; }
  catch(e) { return false; }
}
function v3LoadFromLocalStorage() {
  try {
    const s = localStorage.getItem('v3weights');
    if (!s) return false;
    v3WeightsFromJSON(s); return true;
  } catch(e) { return false; }
}
v3LoadFromLocalStorage();

// ── Shared probability helper (same formula as v1/v2) ─────────────────────
function v3CalcProb(player, card, incPower, incSpin, incCard, psBonus) {
  const rToDropshot = incCard && incCard.dropshot;
  const effInPos = player.inPosition || (card.approach && rToDropshot);
  const { v2 } = getFatigueIncrements();
  const fat = player.fatigue + (!effInPos && v2 > 0 ? v2 : 0);
  const outgoing = card.power - card.spin;
  const incoming = card.type !== 'serve' ? incPower + incSpin + psBonus : 0;
  const total = incoming + outgoing + (card.guided ? 1 : 0);
  const nDice = effInPos ? 2 : 1;
  const d3Range = card.complex ? [1,2,3] : [0];
  let succ = 0, combos = 0;
  for (const d3 of d3Range) {
    if (nDice === 2) {
      for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
        combos++;
        const cs = a===6&&b===6, cf = a===1&&b===1;
        if (cs || (!cf && 6+a+b-fat-d3 >= total)) succ++;
      }
    } else {
      for (let a = 1; a <= 6; a++) {
        combos++;
        if (a===6 || (a!==1 && 6+a-fat-d3 >= total)) succ++;
      }
    }
  }
  return combos > 0 ? succ / combos : 0;
}

function v3CalcOppDiff(card, player, opponent) {
  const dir = card.direction || 'neutral';
  let oop = false;
  if (dir === 'line')  oop = player.position === opponent.position;
  if (dir === 'cross') oop = player.position !== opponent.position;
  if (card.target)        oop = opponent.position !== card.target;
  if (card.targetOpposite) oop = opponent.position === 'BR' || opponent.position === 'BL';
  if (opponent.position === 'Net' && dir !== 'neutral') oop = false;
  if (card.volley && opponent.position === 'Net') oop = false;
  if (card.antiNet && opponent.position === 'Net') oop = true;
  if (card.dropshot && opponent.position !== 'Net') oop = true;
  return { oop, difficulty: card.power + card.spin + (card.powershot ? 3.5 : 0) };
}

// ── Live AI ────────────────────────────────────────────────────────────────
const AIv3 = (() => {
  const DRAW_TARGET = HAND_SIZE;

  function buildOpts(playerIndex) {
    const player   = players[playerIndex];
    const opponent = players[1 - playerIndex];
    const isPlayable = c => isCardPlayable(c, player, incomingPower, incomingCard);
    const sortedItems = v3SortHand(player.hand, isPlayable);
    return {
      position: player.position, inPosition: player.inPosition,
      fatigue: player.fatigue, wasLobbed: player.wasLobbed,
      handSize: player.hand.length, deckSize: player.deck.length,
      discardSize: player.discard.length, hand: player.hand, sortedItems,
      incomingPower, incomingSpin,
      powershotBonus: pendingPowershotBonus, serveAttempt, incomingCard,
      oppPosition: opponent.position, oppInPosition: opponent.inPosition,
      oppFatigue: opponent.fatigue, oppWasLobbed: opponent.wasLobbed,
      myPoints:  playerIndex === 0 ? tennisP1Points : tennisP2Points,
      oppPoints: playerIndex === 0 ? tennisP2Points : tennisP1Points,
      myGames:  gamesWon[playerIndex], oppGames: gamesWon[1 - playerIndex],
      isServing: servingPlayer === playerIndex,
      isPlayable,
      calcProb:    c => v3CalcProb(player, c, incomingPower, incomingSpin, incomingCard, pendingPowershotBonus),
      calcOppDiff: c => v3CalcOppDiff(c, player, opponent),
    };
  }

  function selectPlay(playerIndex) {
    const player = players[playerIndex];
    const isPlayable = c => isCardPlayable(c, player, incomingPower, incomingCard);
    const sortedItems = v3SortHand(player.hand, isPlayable);
    if (!sortedItems.some(item => item && isPlayable(item.card))) return null;

    const opts = buildOpts(playerIndex);
    opts.sortedItems = sortedItems;
    const fwd = v3Forward(v3EncodeState(opts));

    // Card — argmax over playable
    const cardMask = sortedItems.map(item => !!(item && isPlayable(item.card)));
    const chosenSlot = v3Argmax(v3Softmax(fwd.card_raw, cardMask));
    const chosenItem = sortedItems[chosenSlot];
    if (!chosenItem) return null;

    // Discard — argmax; slot 0 = none, 1-5 = sorted slots 0-4 excl. played
    const discMask = [true];
    for (let s = 0; s < HAND_SIZE; s++) {
      const it = sortedItems[s];
      discMask.push(!!(it && s !== chosenSlot && it.card.type !== 'serve' && it.card.color));
    }
    const discSlot = v3Argmax(v3Softmax(fwd.disc_raw, discMask));

    let markIndex = -1;
    if (discSlot > 0) {
      const di = sortedItems[discSlot - 1];
      if (di) markIndex = di.origIdx;
    }
    return { cardIndex: chosenItem.origIdx, markIndex, sortedItems };
  }

  function netRetreat(playerIndex) {
    if (canDiscardForPosition !== playerIndex) return;
    const player   = players[playerIndex];
    const opponent = players[1 - playerIndex];
    if (player.position !== 'Net' || player.hand.length === 0) return;

    const opts = buildOpts(playerIndex);
    const fwd  = v3Forward(v3EncodeState(opts));

    const moveMask = [
      true,
      player.position !== 'BL',
      player.position !== 'BR',
      player.position !== 'Net',
    ];
    const moveSlot = v3Argmax(v3Softmax(fwd.move_raw, moveMask));
    if (moveSlot === 0) return;

    const target = V3_MOVE_POSITIONS[moveSlot];
    // Heuristic card selection for position discard (same as v1/v2)
    let di = player.hand.findIndex(c => c.overhead);
    if (di === -1) di = player.hand.findIndex(c => c.color === 'green');
    if (di === -1) {
      let lo = Infinity;
      player.hand.forEach((c, idx) => {
        const p = v3CalcProb(player, c, incomingPower, incomingSpin, incomingCard, pendingPowershotBonus);
        if (p < lo) { lo = p; di = idx; }
      });
    }
    if (di !== -1) discardForPosition(playerIndex, di, target);
  }

  function playTurn(playerIndex) {
    const player = players[playerIndex];

    // Draw phase — draw head only has veto when at least one playable card exists.
    // With zero playable cards, drawing is mandatory until one appears or hand is full.
    while (player.hand.length < DRAW_TARGET) {
      const hasPlayable = player.hand.some(c => isCardPlayable(c, player, incomingPower, incomingCard));
      if (hasPlayable) {
        const opts = buildOpts(playerIndex);
        const fwd  = v3Forward(v3EncodeState(opts));
        const drawProb = v3Sigmoid(fwd.draw_raw[0]);
        if (drawProb < 0.5) break;
      }
      drawCard(player, log);
      markedCardIndices[playerIndex] = -1;
      log(`${player.name} (AI v3) draws (${player.hand.length}/${DRAW_TARGET})`);
    }
    render(players, currentPlayer, gameLog);

    const decision = selectPlay(playerIndex);
    if (!decision) {
      log(`${player.name} (AI v3) has no playable cards — point lost!`);
      endPoint(1 - playerIndex);
      render(players, currentPlayer, gameLog);
      return;
    }

    if (decision.markIndex !== -1) markCardForDiscard(playerIndex, decision.markIndex, true);

    const card = player.hand[decision.cardIndex];
    const prob = v3CalcProb(player, card, incomingPower, incomingSpin, incomingCard, pendingPowershotBonus);
    log(`${player.name} (AI v3) → <strong>${card.name}</strong> (${(prob * 100).toFixed(0)}%)`);
    playCard(playerIndex, decision.cardIndex);
    netRetreat(playerIndex);
  }

  return { DRAW_TARGET, selectPlay, netRetreat, playTurn };
})();
