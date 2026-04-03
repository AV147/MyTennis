// ===== SIMULATION ENGINE v3 =====
// Greedy (argmax) play using trained v3 weights — used for headless eval.
// Stochastic play + trajectory collection lives in ai-v3-train.js.

// ── Shared state builder (used by SimAIv3 and the training runner) ─────────
function v3BuildSimOpts(player, opponent, incPower, incSpin, incCard, psBonus, serveAttempt) {
  const isPlayable  = c => simIsCardPlayable(c, player, incPower, incCard);
  const sortedItems = v3SortHand(player.hand, isPlayable);
  return {
    position: player.position, inPosition: player.inPosition,
    fatigue: player.fatigue, wasLobbed: player.wasLobbed,
    handSize: player.hand.length, deckSize: player.deck.length,
    discardSize: player.discard.length, hand: player.hand, sortedItems,
    incomingPower: incPower, incomingSpin: incSpin,
    powershotBonus: psBonus, serveAttempt, incomingCard: incCard,
    oppPosition: opponent.position, oppInPosition: opponent.inPosition,
    oppFatigue: opponent.fatigue, oppWasLobbed: opponent.wasLobbed,
    // Score not tracked in simulation — zeros
    myPoints: 0, oppPoints: 0, myGames: 0, oppGames: 0, isServing: false,
    isPlayable,
    calcProb:    c => simCalcProb(player, c, incPower, incSpin, incCard, psBonus),
    calcOppDiff: c => { const r = simOppDifficulty(c, player, opponent); return r; },
  };
}

const SimAIv3 = (() => {
  const DRAW_TARGET = HAND_SIZE;

  function selectCard(player, opponent, incPower, incSpin, incCard, psBonus, serveAttempt) {
    const isPlayable  = c => simIsCardPlayable(c, player, incPower, incCard);
    const sortedItems = v3SortHand(player.hand, isPlayable);
    if (!sortedItems.some(it => it && isPlayable(it.card))) return null;

    const opts = v3BuildSimOpts(player, opponent, incPower, incSpin, incCard, psBonus, serveAttempt);
    const fwd  = v3Forward(v3EncodeState(opts));

    // Card — argmax
    const cardMask = sortedItems.map(it => !!(it && isPlayable(it.card)));
    const chosenSlot = v3Argmax(v3Softmax(fwd.card_raw, cardMask));
    const chosenItem = sortedItems[chosenSlot];
    if (!chosenItem) return null;

    // Discard — argmax; slot 0=none, 1-5=sorted slots 0-4 excl. played card
    const discMask = [true];
    for (let s = 0; s < HAND_SIZE; s++) {
      const it = sortedItems[s];
      discMask.push(!!(it && s !== chosenSlot && it.card.type !== 'serve' && it.card.color));
    }
    const discSlot = v3Argmax(v3Softmax(fwd.disc_raw, discMask));

    let discardIdx = -1, discardColor = null;
    if (discSlot > 0) {
      const di = sortedItems[discSlot - 1];
      if (di) { discardIdx = di.origIdx; discardColor = di.card.color; }
    }

    return { cardIdx: chosenItem.origIdx, card: chosenItem.card, discardIdx, discardColor };
  }

  // Move head — called by simRunPoint when player is at Net after shooting.
  // Returns { position } to move to, or null to stay.
  function selectMove(player, opponent, incPower, incSpin, incCard, psBonus, serveAttempt) {
    if (player.hand.length === 0) return null;
    const opts = v3BuildSimOpts(player, opponent, incPower, incSpin, incCard, psBonus, serveAttempt);
    const fwd  = v3Forward(v3EncodeState(opts));

    const moveMask = [
      true,                          // 0 = stay (none)
      player.position !== 'BL',      // 1 = BL
      player.position !== 'BR',      // 2 = BR
      false,                         // 3 = Net (already there, nonsensical)
    ];
    const moveSlot = v3Argmax(v3Softmax(fwd.move_raw, moveMask));
    if (moveSlot === 0) return null;  // stay at Net
    return { position: V3_MOVE_POSITIONS[moveSlot] };
  }

  return { DRAW_TARGET, selectCard, selectMove };
})();
