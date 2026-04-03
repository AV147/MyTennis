// ===== AI v3 Training Engine =====
// REINFORCE policy gradient with Adam optimiser and reward shaping.
// Runs entirely headless using the simulation infrastructure.

// ── Hyperparameters ───────────────────────────────────────────────────────
const V3_LR        = 0.001;
const V3_GAMMA     = 0.95;
const V3_BETA1     = 0.9;
const V3_BETA2     = 0.999;
const V3_EPS       = 1e-8;
const V3_GRAD_CLIP = 5.0;

// Rewards
const V3_R_WIN       =  0.20;
const V3_R_HIT       =  0.10;
const V3_R_ACTIVE    =  0.05;   // used red or green active discard
const V3_R_LOW_CARDS = -0.10;   // < 2 playable cards at play phase
const V3_R_LOSE      = -0.20;

// ── Adam state ────────────────────────────────────────────────────────────
let v3AdamT = 0;
const v3Adam = { m: {}, v: {} };

function v3AdamInit() {
  v3AdamT = 0;
  for (const k of Object.keys(v3W)) {
    v3Adam.m[k] = new Float32Array(v3W[k].length);
    v3Adam.v[k] = new Float32Array(v3W[k].length);
  }
}
v3AdamInit();

let v3Baseline = 0;  // running mean of returns for variance reduction

// ── Gradient helpers ──────────────────────────────────────────────────────
function v3ZeroGrads() {
  const g = {};
  for (const k of Object.keys(v3W)) g[k] = new Float32Array(v3W[k].length);
  return g;
}

function v3Clip(x) { return Math.max(-V3_GRAD_CLIP, Math.min(V3_GRAD_CLIP, x)); }

// ── Backward pass (accumulates into grads in-place) ───────────────────────
// d_out: { d_draw (scalar), d_card[N_CARD], d_disc[N_DISC], d_move[N_MOVE] }
function v3Backward(features, fwd, d_out, grads) {

  // Gradient flowing back to h2 from all output heads
  const d_h2 = new Float32Array(V3_H2);

  const gDraw = v3Clip(d_out.d_draw || 0);
  for (let i = 0; i < V3_H2; i++) d_h2[i] += gDraw * v3W.W_draw[i];

  for (let j = 0; j < V3_N_CARD; j++) {
    const g = v3Clip(d_out.d_card ? d_out.d_card[j] : 0);
    if (!g) continue;
    for (let i = 0; i < V3_H2; i++) d_h2[i] += g * v3W.W_card[i * V3_N_CARD + j];
  }
  for (let j = 0; j < V3_N_DISC; j++) {
    const g = v3Clip(d_out.d_disc ? d_out.d_disc[j] : 0);
    if (!g) continue;
    for (let i = 0; i < V3_H2; i++) d_h2[i] += g * v3W.W_disc[i * V3_N_DISC + j];
  }
  for (let j = 0; j < V3_N_MOVE; j++) {
    const g = v3Clip(d_out.d_move ? d_out.d_move[j] : 0);
    if (!g) continue;
    for (let i = 0; i < V3_H2; i++) d_h2[i] += g * v3W.W_move[i * V3_N_MOVE + j];
  }

  // ReLU @ h2
  const d_h2_pre = new Float32Array(V3_H2);
  for (let i = 0; i < V3_H2; i++) d_h2_pre[i] = fwd.h2_pre[i] > 0 ? d_h2[i] : 0;

  // d_h1 = d_h2_pre @ W2^T
  const d_h1 = new Float32Array(V3_H1);
  for (let i = 0; i < V3_H1; i++)
    for (let j = 0; j < V3_H2; j++) d_h1[i] += d_h2_pre[j] * v3W.W2[i * V3_H2 + j];

  // ReLU @ h1
  const d_h1_pre = new Float32Array(V3_H1);
  for (let i = 0; i < V3_H1; i++) d_h1_pre[i] = fwd.h1_pre[i] > 0 ? d_h1[i] : 0;

  // Accumulate weight gradients
  for (let i = 0; i < V3_N_INPUT; i++) {
    if (!features[i]) continue;
    for (let j = 0; j < V3_H1; j++) grads.W1[i * V3_H1 + j] += features[i] * d_h1_pre[j];
  }
  for (let j = 0; j < V3_H1; j++) grads.b1[j] += d_h1_pre[j];

  for (let i = 0; i < V3_H1; i++) {
    if (!fwd.h1[i]) continue;
    for (let j = 0; j < V3_H2; j++) grads.W2[i * V3_H2 + j] += fwd.h1[i] * d_h2_pre[j];
  }
  for (let j = 0; j < V3_H2; j++) grads.b2[j] += d_h2_pre[j];

  for (let i = 0; i < V3_H2; i++) {
    if (!fwd.h2[i]) continue;
    grads.W_draw[i] += fwd.h2[i] * gDraw;
    for (let j = 0; j < V3_N_CARD; j++) grads.W_card[i * V3_N_CARD + j] += fwd.h2[i] * v3Clip(d_out.d_card ? d_out.d_card[j] : 0);
    for (let j = 0; j < V3_N_DISC; j++) grads.W_disc[i * V3_N_DISC + j] += fwd.h2[i] * v3Clip(d_out.d_disc ? d_out.d_disc[j] : 0);
    for (let j = 0; j < V3_N_MOVE; j++) grads.W_move[i * V3_N_MOVE + j] += fwd.h2[i] * v3Clip(d_out.d_move ? d_out.d_move[j] : 0);
  }
  grads.b_draw[0] += gDraw;
  if (d_out.d_card) for (let j = 0; j < V3_N_CARD; j++) grads.b_card[j] += v3Clip(d_out.d_card[j]);
  if (d_out.d_disc) for (let j = 0; j < V3_N_DISC; j++) grads.b_disc[j] += v3Clip(d_out.d_disc[j]);
  if (d_out.d_move) for (let j = 0; j < V3_N_MOVE; j++) grads.b_move[j] += v3Clip(d_out.d_move[j]);
}

// ── Adam weight update ────────────────────────────────────────────────────
function v3AdamStep(grads) {
  v3AdamT++;
  const bc1 = 1 - Math.pow(V3_BETA1, v3AdamT);
  const bc2 = 1 - Math.pow(V3_BETA2, v3AdamT);
  for (const k of Object.keys(v3W)) {
    const w = v3W[k], g = grads[k], m = v3Adam.m[k], v = v3Adam.v[k];
    for (let i = 0; i < w.length; i++) {
      m[i] = V3_BETA1 * m[i] + (1 - V3_BETA1) * g[i];
      v[i] = V3_BETA2 * v[i] + (1 - V3_BETA2) * g[i] * g[i];
      w[i] += V3_LR * (m[i] / bc1) / (Math.sqrt(v[i] / bc2) + V3_EPS);
    }
  }
}

// ── REINFORCE update for one point's trajectory ───────────────────────────
function v3UpdateFromTrajectory(trajectory, winner, v3PlayerIdx) {
  if (!trajectory.length) return;

  // Terminal reward on last step
  trajectory[trajectory.length - 1].reward += winner === v3PlayerIdx ? V3_R_WIN : V3_R_LOSE;

  // Discounted returns (backwards sweep)
  let G = 0;
  for (let t = trajectory.length - 1; t >= 0; t--) {
    G = trajectory[t].reward + V3_GAMMA * G;
    trajectory[t].G = G;
  }

  // Update baseline
  const mean = trajectory.reduce((s, st) => s + st.G, 0) / trajectory.length;
  v3Baseline = 0.99 * v3Baseline + 0.01 * mean;

  const grads = v3ZeroGrads();

  for (const step of trajectory) {
    const A = step.G - v3Baseline;   // advantage

    const d_out = { d_draw: 0, d_card: null, d_disc: null, d_move: null };

    if (step.type === 'draw') {
      // sigmoid: ∇ log π = action − prob
      d_out.d_draw = A * (step.drawAction - step.drawProb);

    } else if (step.type === 'play') {
      // softmax: ∇ log π_k = δ(i,k) − p_i
      d_out.d_card = new Float32Array(V3_N_CARD);
      d_out.d_disc = new Float32Array(V3_N_DISC);
      for (let j = 0; j < V3_N_CARD; j++)
        d_out.d_card[j] = A * ((j === step.cardAction ? 1 : 0) - step.cardProbs[j]);
      for (let j = 0; j < V3_N_DISC; j++)
        d_out.d_disc[j] = A * ((j === step.discAction ? 1 : 0) - step.discProbs[j]);

    } else if (step.type === 'move') {
      d_out.d_move = new Float32Array(V3_N_MOVE);
      for (let j = 0; j < V3_N_MOVE; j++)
        d_out.d_move[j] = A * ((j === step.moveAction ? 1 : 0) - step.moveProbs[j]);
    }

    v3Backward(step.features, step.fwd, d_out, grads);
  }

  // Normalise by trajectory length before Adam step
  const n = trajectory.length;
  for (const k of Object.keys(grads))
    for (let i = 0; i < grads[k].length; i++) grads[k][i] /= n;

  v3AdamStep(grads);
}

// ── Training point runner ─────────────────────────────────────────────────
// Identical to simRunPoint but v3's turns use stochastic sampling and record
// trajectory steps; opponent turns run their engine normally.

function simRunPointV3Train(p0, p1, servingIdx, startPos, v3Idx, oppEngine) {
  const ps = [p0, p1];
  const trajectory = [];

  let incPower = 0, incSpin = 0, incCard = null, psBonus = 0;
  let serveAttempt = 1, current = servingIdx;

  // Reset per-point state — deck/discard persist across points.
  ps.forEach(p => {
    p.discard.push(...p.hand, ...(p.temporaryRemovedServes || []));
    p.hand = []; p.temporaryRemovedServes = [];
    p.inPosition = true; p.position = startPos; p.fatigue = 0;
    p.positionBeforeDropshot = null; p.wasLobbed = false;
    // No reshuffle here — deck carries over from the previous point.
  });

  const server = ps[servingIdx], returner = ps[1 - servingIdx];

  // Server: pull serves from deck first, then from discard
  for (let i = server.deck.length-1; i >= 0; i--)
    if (server.deck[i].type === 'serve') server.hand.push(...server.deck.splice(i,1));
  for (let i = server.discard.length-1; i >= 0; i--)
    if (server.discard[i].type === 'serve') server.hand.push(...server.discard.splice(i,1));
  while (server.hand.length < HAND_SIZE) {
    if (!server.deck.length) { server.deck = shuffle([...server.discard]); server.discard = []; }
    server.hand.push(server.deck.pop());
  }

  // Returner: temporarily remove serves from deck first, then from discard
  for (let i = returner.deck.length-1; i >= 0; i--)
    if (returner.deck[i].type === 'serve') returner.temporaryRemovedServes.push(...returner.deck.splice(i,1));
  for (let i = returner.discard.length-1; i >= 0; i--)
    if (returner.discard[i].type === 'serve') returner.temporaryRemovedServes.push(...returner.discard.splice(i,1));
  while (returner.hand.length < HAND_SIZE) {
    if (!returner.deck.length) { returner.deck = shuffle([...returner.discard]); returner.discard = []; }
    returner.hand.push(returner.deck.pop());
  }

  for (let turn = 0; turn < SIM_MAX_TURNS; turn++) {
    const player   = ps[current];
    const opponent = ps[1 - current];
    const isV3     = current === v3Idx;

    if (isV3) {
      // ── Draw phase ──────────────────────────────────────────────────────
      // Draw head only has veto when at least one playable card exists.
      // With zero playable cards, drawing is mandatory until one appears or hand is full.
      while (player.hand.length < HAND_SIZE) {
        const isPlay     = c => simIsCardPlayable(c, player, incPower, incCard);
        const hasPlayable = player.hand.some(isPlay);
        const si         = v3SortHand(player.hand, isPlay);
        const opts       = v3BuildSimOpts(player, opponent, incPower, incSpin, incCard, psBonus, serveAttempt);
        opts.sortedItems = si;
        const features   = v3EncodeState(opts);
        const fwd        = v3Forward(features);
        const drawProb   = v3Sigmoid(fwd.draw_raw[0]);
        // If no playable cards, force draw (drawAction=1 regardless of head)
        const drawAction = hasPlayable ? (Math.random() < drawProb ? 1 : 0) : 1;

        trajectory.push({ type: 'draw', features, fwd, drawAction, drawProb, reward: 0 });
        if (!drawAction) break;
        simDrawCard(player);
      }

      // After forced draws, if still no playable card, point is legitimately lost
      if (!player.hand.some(c => simIsCardPlayable(c, player, incPower, incCard)))
        return { winner: 1 - current, trajectory };

      // ── Play phase ──────────────────────────────────────────────────────
      const isPlay     = c => simIsCardPlayable(c, player, incPower, incCard);
      const sortedItems = v3SortHand(player.hand, isPlay);
      const opts = v3BuildSimOpts(player, opponent, incPower, incSpin, incCard, psBonus, serveAttempt);
      opts.sortedItems = sortedItems;
      const features = v3EncodeState(opts);
      const fwd      = v3Forward(features);

      const playableCount = player.hand.filter(c => isPlay(c)).length;
      let playReward = playableCount < 2 ? V3_R_LOW_CARDS : 0;

      // Card decision (stochastic)
      const cardMask = sortedItems.map(it => !!(it && isPlay(it.card)));
      const cardProbs = v3Softmax(fwd.card_raw, cardMask);
      let chosenSlot = v3Sample(cardProbs);
      if (!sortedItems[chosenSlot]) chosenSlot = cardMask.findIndex(Boolean);
      const chosenItem = sortedItems[chosenSlot];
      if (!chosenItem) return { winner: 1 - current, trajectory };

      // Discard decision (stochastic)
      const discMask = [true];
      for (let s = 0; s < HAND_SIZE; s++) {
        const it = sortedItems[s];
        discMask.push(!!(it && s !== chosenSlot && it.card.type !== 'serve' && it.card.color));
      }
      const discProbs = v3Softmax(fwd.disc_raw, discMask);
      const discSlot  = v3Sample(discProbs);

      // Remove played card
      const cardIdx  = chosenItem.origIdx;
      const played   = player.hand.splice(cardIdx, 1)[0];
      player.discard.push(played);

      // Active discard
      let bonusPow = 0, bonusSpin = 0, pendGreen = false, usedActive = false;
      if (discSlot > 0 && played.type !== 'serve') {
        const di = sortedItems[discSlot - 1];
        if (di) {
          const adj = di.origIdx > cardIdx ? di.origIdx - 1 : di.origIdx;
          if (adj >= 0 && adj < player.hand.length) {
            const dc = player.hand.splice(adj, 1)[0];
            player.discard.push(dc);
            if (dc.color === 'red')   { bonusPow = 2; usedActive = true; }
            if (dc.color === 'blue')  bonusSpin = 1;
            if (dc.color === 'green') { pendGreen = true; usedActive = true; }
          }
        }
      }

      // Track dropshot response origin (mirrors game.js pre-play block)
      if (incCard && incCard.dropshot && player.position !== 'Net') {
        player.positionBeforeDropshot = player.position;
      }

      // Approach+dropshot overrides OOP — capture wasInPos AFTER override
      if (played.approach && incCard && incCard.dropshot) player.inPosition = true;
      const wasInPos = player.inPosition;

      const result = resolveShot(player, played, incPower, incSpin, incCard, psBonus, bonusPow, bonusSpin);
      psBonus = 0;
      const { v1, v2 } = getFatigueIncrements();

      if (result.success) playReward += V3_R_HIT + (usedActive ? V3_R_ACTIVE : 0);

      trajectory.push({
        type: 'play', features, fwd,
        cardAction: chosenSlot, cardProbs,
        discAction: discSlot,  discProbs,
        reward: playReward,
      });

      if (result.success) {
        // Fatigue on successful shot
        player.fatigue += v1;
        if (!wasInPos) player.fatigue += v2;

        if (played.powershot) psBonus = Math.floor(Math.random() * 6) + 1;
        if (pendGreen) simDrawCard(player, true); // free draw — no fatigue
        if (played.type === 'serve') serveAttempt = 1;
        simApplyPositioning(player, played, incCard);
        simApplyOpponentPositioning(played, player, opponent);
        // Lob repositioning fully handled inside simApplyOpponentPositioning
        incPower = result.shotPower; incSpin = result.shotSpin; incCard = played;

        // ── Move phase — only when at Net (mirror of live netRetreat) ────
        if (player.position === 'Net' && player.hand.length > 0) {
          const mPlay = c => simIsCardPlayable(c, player, incPower, incCard);
          const mSI   = v3SortHand(player.hand, mPlay);
          const mOpts = v3BuildSimOpts(player, opponent, incPower, incSpin, incCard, psBonus, serveAttempt);
          mOpts.sortedItems = mSI;
          const mFeatures = v3EncodeState(mOpts);
          const mFwd      = v3Forward(mFeatures);

          // option 0=stay, 1=BL, 2=BR; Net (3) is masked — already there
          const moveMask = [true, true, true, false];
          const moveProbs  = v3Softmax(mFwd.move_raw, moveMask);
          const moveAction = v3Sample(moveProbs);

          trajectory.push({ type: 'move', features: mFeatures, fwd: mFwd, moveAction, moveProbs, reward: 0 });

          if (moveAction > 0) {
            const target = V3_MOVE_POSITIONS[moveAction]; // 'BL' or 'BR'
            let di = player.hand.findIndex(c => c.overhead);
            if (di === -1) di = player.hand.findIndex(c => c.color === 'green');
            if (di === -1) {
              let lo = Infinity;
              player.hand.forEach((c, idx) => {
                const p = simCalcProb(player, c, incPower, incSpin, incCard, psBonus);
                if (p < lo) { lo = p; di = idx; }
              });
            }
            if (di !== -1) {
              player.discard.push(player.hand.splice(di, 1)[0]);
              player.position = target; player.inPosition = true;
              const { v2: fv2 } = getFatigueIncrements();
              if (fv2 > 0) player.fatigue += fv2;
            }
          }
        }

        current = 1 - current;

      } else {
        if (pendGreen) simDrawCard(player, true); // free draw — no fatigue
        if (played.type === 'serve') {
          // Serve fault: no fatigue (mirrors game.js)
          if (serveAttempt === 1) { serveAttempt = 2; continue; }
          return { winner: 1 - current, trajectory };
        }
        // Normal miss: fatigue applies
        player.fatigue += v1;
        if (!wasInPos) player.fatigue += v2;
        return { winner: 1 - current, trajectory };
      }

    } else {
      // ── Opponent turn ────────────────────────────────────────────────────
      simDrawToTarget(player, oppEngine.DRAW_TARGET);
      if (!player.hand.some(c => simIsCardPlayable(c, player, incPower, incCard)))
        return { winner: 1 - current, trajectory };

      const dec = oppEngine.selectCard(player, opponent, incPower, incSpin, incCard, psBonus, serveAttempt);
      if (!dec) return { winner: 1 - current, trajectory };

      const { cardIdx, discardIdx, discardColor } = dec;
      const played = player.hand.splice(cardIdx, 1)[0];
      player.discard.push(played);

      let bonusPow = 0, bonusSpin = 0, pendGreen = false;
      if (discardIdx !== -1 && played.type !== 'serve') {
        const adj = discardIdx > cardIdx ? discardIdx - 1 : discardIdx;
        if (adj >= 0 && adj < player.hand.length) {
          const dc = player.hand.splice(adj, 1)[0];
          player.discard.push(dc);
          if (discardColor === 'red')   bonusPow  = 2;
          if (discardColor === 'blue')  bonusSpin = 1;
          if (discardColor === 'green') pendGreen   = true;
        }
      }

      // Track dropshot response origin (mirrors game.js pre-play block)
      if (incCard && incCard.dropshot && player.position !== 'Net') {
        player.positionBeforeDropshot = player.position;
      }

      // Approach+dropshot overrides OOP — capture wasInPos AFTER override
      if (played.approach && incCard && incCard.dropshot) player.inPosition = true;
      const wasInPos = player.inPosition;

      const result = resolveShot(player, played, incPower, incSpin, incCard, psBonus, bonusPow, bonusSpin);
      psBonus = 0;
      const { v1, v2 } = getFatigueIncrements();

      if (result.success) {
        // Fatigue on successful shot
        player.fatigue += v1;
        if (!wasInPos) player.fatigue += v2;

        if (played.powershot) psBonus = Math.floor(Math.random() * 6) + 1;
        if (pendGreen) simDrawCard(player, true); // free draw — no fatigue
        if (played.type === 'serve') serveAttempt = 1;
        simApplyPositioning(player, played, incCard);
        simApplyOpponentPositioning(played, player, opponent);
        // Lob repositioning fully handled inside simApplyOpponentPositioning
        incPower = result.shotPower; incSpin = result.shotSpin; incCard = played;
        if (player.position === 'Net') {
          simNetRetreat(player, opponent, incPower, incSpin, incCard, psBonus);
        }
        current = 1 - current;
      } else {
        if (pendGreen) simDrawCard(player, true); // free draw — no fatigue
        if (played.type === 'serve') {
          // Serve fault: no fatigue (mirrors game.js)
          if (serveAttempt === 1) { serveAttempt = 2; continue; }
          return { winner: 1 - current, trajectory };
        }
        // Normal miss: fatigue applies
        player.fatigue += v1;
        if (!wasInPos) player.fatigue += v2;
        return { winner: 1 - current, trajectory };
      }
    }
  }
  return { winner: v3Idx, trajectory };
}

// ── Training loop ─────────────────────────────────────────────────────────
let v3TrainingActive = false;
let v3TrainOppVersion = 'v2';
let v3TrainNumPoints  = 5000;

function trainV3(totalPoints, oppVersionKey, onProgress, onDone) {
  v3TrainingActive = true;
  const stats = { points: 0, wins: 0 };
  const OPP = { v1: SimAIv1, v2: SimAIv2, self: SimAIv3 };
  const oppEngine = OPP[oppVersionKey] || SimAIv2;

  const p0 = simClonePlayer(0, 'BR');
  const p1 = simClonePlayer(1, 'BR');
  // Shuffle once for the first game
  p0.deck = shuffle([...p0.deck]);
  p1.deck = shuffle([...p1.deck]);

  let done = 0;
  let simP0Points = 0, simP1Points = 0; // game-level point tracking
  let simServingIdx = 0;

  function batch() {
    if (!v3TrainingActive) { onDone && onDone(stats); return; }
    const bsz = Math.min(100, totalPoints - done);
    for (let i = 0; i < bsz; i++) {
      const startPos = done % 2 === 0 ? 'BR' : 'BL';
      const v3Idx    = done % 4 < 2 ? 0 : 1;
      const { winner, trajectory } = simRunPointV3Train(p0, p1, simServingIdx, startPos, v3Idx, oppEngine);
      v3UpdateFromTrajectory(trajectory, winner, v3Idx);
      if (winner === v3Idx) stats.wins++;
      stats.points++; done++;

      // Track game score — reshuffle and switch serve when game ends
      if (winner === 0) simP0Points++; else simP1Points++;
      const p0g = simP0Points, p1g = simP1Points;
      if ((p0g >= 4 && p0g - p1g >= 2) || (p1g >= 4 && p1g - p0g >= 2)) {
        simP0Points = 0; simP1Points = 0;
        simServingIdx = 1 - simServingIdx;
        // Reshuffle both decks for the new game
        [p0, p1].forEach(p => {
          p.discard.push(...p.hand, ...(p.temporaryRemovedServes || []));
          p.hand = []; p.temporaryRemovedServes = [];
          p.deck = shuffle([...p.deck, ...p.discard]);
          p.discard = [];
        });
      }
    }
    onProgress && onProgress(stats, totalPoints);
    if (done >= totalPoints) {
      v3TrainingActive = false;
      v3SaveToLocalStorage();
      onDone && onDone(stats);
    } else {
      setTimeout(batch, 0);
    }
  }
  setTimeout(batch, 0);
}

// ── Training UI ───────────────────────────────────────────────────────────
function renderV3TrainUI() {
  let el = document.getElementById('v3-train-panel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'v3-train-panel';
    el.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:8px',
      'flex-wrap:wrap', 'justify-content:center',
      'margin:6px 0', 'padding:8px 14px',
      'background:#fdf5ff', 'border:2px solid #8e44ad',
      'border-radius:8px', 'font-size:12px',
    ].join(';');
    const hdr = document.querySelector('header');
    if (hdr) hdr.appendChild(el);
  }
  const active = v3TrainingActive;
  const D = active ? 'disabled' : '';
  el.innerHTML = `
    <span style="font-weight:bold;color:#8e44ad;">🧠 AI v3 Train</span>
    <label>Opponent:
      <select ${D} onchange="v3TrainOppVersion=this.value" style="margin-left:4px;">
        <option value="v1"  ${v3TrainOppVersion==='v1'  ?'selected':''}>AI v1</option>
        <option value="v2"  ${v3TrainOppVersion==='v2'  ?'selected':''}>AI v2</option>
        <option value="self"${v3TrainOppVersion==='self'?'selected':''}>Self</option>
      </select>
    </label>
    <label>Points:
      <input type="number" value="${v3TrainNumPoints}" min="100" max="200000" step="1000"
        style="width:72px;margin-left:4px;" ${D}
        onchange="v3TrainNumPoints=Math.max(100,parseInt(this.value)||5000)">
    </label>
    <button onclick="startV3Training()"  style="background:#8e44ad;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;" ${D}>▶ Train</button>
    <button onclick="stopV3Training()"   style="background:#c0392b;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;" ${!active?'disabled':''}>⏹ Stop</button>
    <button onclick="resetV3Weights()"   style="background:#7f8c8d;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;" ${D}>↺ Reset</button>
    <button onclick="exportV3Weights()"  style="background:#27ae60;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;" ${D}>💾 Save</button>
    <label style="background:#2980b9;color:#fff;border-radius:5px;padding:4px 10px;cursor:pointer;">
      📂 Load<input type="file" accept=".json" style="display:none;" onchange="importV3Weights(this)">
    </label>
    <span id="v3-train-status" style="color:#555;min-width:160px;">${active ? 'Training…' : 'Ready'}</span>`;
}

function startV3Training() {
  if (v3TrainingActive) return;
  renderV3TrainUI();
  trainV3(v3TrainNumPoints, v3TrainOppVersion,
    (stats, total) => {
      const pct = ((stats.points / total) * 100).toFixed(0);
      const wr  = stats.points > 0 ? (stats.wins / stats.points * 100).toFixed(1) : '0.0';
      const el = document.getElementById('v3-train-status');
      if (el) el.textContent = `${pct}% | WR ${wr}% (${stats.wins}/${stats.points})`;
    },
    (stats) => {
      const wr = stats.points > 0 ? (stats.wins / stats.points * 100).toFixed(1) : '0.0';
      const el = document.getElementById('v3-train-status');
      if (el) el.textContent = `✓ Done  WR ${wr}% (${stats.wins}/${stats.points})`;
      renderV3TrainUI();
    }
  );
  renderV3TrainUI();
}
function stopV3Training()  { v3TrainingActive = false; renderV3TrainUI(); }
function resetV3Weights()  {
  if (v3TrainingActive) return;
  v3InitWeights(); v3AdamInit(); v3Baseline = 0;
  try { localStorage.removeItem('v3weights'); } catch(e) {}
  const el = document.getElementById('v3-train-status');
  if (el) el.textContent = 'Weights reset.';
}
function exportV3Weights() {
  const blob = new Blob([v3WeightsToJSON()], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'v3-weights.json' });
  a.click(); URL.revokeObjectURL(url);
}
function importV3Weights(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      v3WeightsFromJSON(e.target.result);
      const el = document.getElementById('v3-train-status');
      if (el) el.textContent = 'Weights loaded ✓';
    } catch(err) { alert('Load failed: ' + err.message); }
  };
  r.readAsText(f);
}
