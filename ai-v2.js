// ===== AI v2: Probabilistic Rule-Based Engine =====
// Changes from v1: draws to 4, smart red/blue/green discard logic.
// Exposed as AIv2 object — consumed by ai.js dispatcher.

const AIv2 = (() => {

  const DRAW_TARGET = HAND_SIZE; // draw to 5

  function calcProbability(player, card, incPower, incSpin, incCard, powershotBonus,
                            bonusPower = 0, bonusSpin = 0) {
    const isRespondingToDropshot = incCard && incCard.dropshot;
    const effectivelyInPos = player.inPosition || (card.approach && isRespondingToDropshot);
    const { v2 } = getFatigueIncrements();
    const fatigue = player.fatigue + (!effectivelyInPos && v2 > 0 ? v2 : 0);

    const outgoingComplexity = (card.power + bonusPower) - (card.spin + bonusSpin);
    let incomingComplexity = 0;
    if (card.type !== 'serve') incomingComplexity = incPower + incSpin + powershotBonus;
    const guidedPenalty   = card.guided ? 1 : 0;
    const totalComplexity = incomingComplexity + outgoingComplexity + guidedPenalty;

    const numDice = effectivelyInPos ? 2 : 1;
    let successCount = 0, totalCombos = 0;
    const d3Range = card.complex ? [1, 2, 3] : [0];

    for (const d3 of d3Range) {
      if (numDice === 2) {
        for (let d1 = 1; d1 <= 6; d1++) for (let d2 = 1; d2 <= 6; d2++) {
          totalCombos++;
          const isCritS = (d1 === 6 && d2 === 6);
          const isCritF = (d1 === 1 && d2 === 1);
          if (isCritS || (!isCritF && 6 + d1 + d2 - fatigue - d3 >= totalComplexity)) successCount++;
        }
      } else {
        for (let d1 = 1; d1 <= 6; d1++) {
          totalCombos++;
          if (d1 === 6 || (d1 !== 1 && 6 + d1 - fatigue - d3 >= totalComplexity)) successCount++;
        }
      }
    }
    return totalCombos > 0 ? successCount / totalCombos : 0;
  }

  function opponentDifficulty(card, player, opponent) {
    const oop = calcOpponentOutOfPosition(card, player, opponent);
    const powershotExpected = card.powershot ? 3.5 : 0;
    return { outOfPosition: oop, difficulty: card.power + card.spin + powershotExpected };
  }

  function selectPlay(playerIndex) {
    const player   = players[playerIndex];
    const opponent = players[1 - playerIndex];

    const candidates = [];
    player.hand.forEach((card, idx) => {
      if (!isCardPlayable(card, player, incomingPower, incomingCard)) return;
      const prob = calcProbability(player, card, incomingPower, incomingSpin, incomingCard, pendingPowershotBonus);
      const { outOfPosition, difficulty } = opponentDifficulty(card, player, opponent);
      candidates.push({ idx, card, prob, outOfPosition, difficulty });
    });
    if (candidates.length === 0) return null;

    // First serve: always pick highest-power serve
    if (incomingPower === 0 && serveAttempt === 1) {
      const chosen   = candidates.reduce((best, c) => c.card.power > best.card.power ? c : best, candidates[0]);
      const greenIdx = player.hand.findIndex((c, i) => i !== chosen.idx && c.color === 'green');
      return { cardIndex: chosen.idx, markIndex: greenIdx !== -1 ? greenIdx : -1, prob: chosen.prob, card: chosen.card };
    }

    candidates.sort((a, b) => {
      if (a.outOfPosition !== b.outOfPosition) return (b.outOfPosition ? 1 : 0) - (a.outOfPosition ? 1 : 0);
      return b.difficulty - a.difficulty;
    });

    let chosen = candidates.find(c => c.prob >= 0.80);
    if (!chosen) chosen = candidates.reduce((best, c) => c.prob > best.prob ? c : best, candidates[0]);

    // ── Discard decision (mutually exclusive, priority: red → blue → green) ──
    let markIndex = -1;

    if (chosen.prob < 0.80) {
      // BLUE: always discard blue to improve spin (reduce complexity) when below 80%
      const blueIdx = player.hand.findIndex((c, i) => i !== chosen.idx && c.color === 'blue');
      if (blueIdx !== -1) markIndex = blueIdx;
    } else {
      // RED: +2 power only if shot stays ≥ 80% after bonus
      const redIdx = player.hand.findIndex((c, i) => i !== chosen.idx && c.color === 'red');
      if (redIdx !== -1) {
        const probWithPower = calcProbability(
          player, chosen.card, incomingPower, incomingSpin, incomingCard, pendingPowershotBonus, 2, 0
        );
        if (probWithPower >= 0.80) markIndex = redIdx;
      }
    }

    // GREEN fallback: free redraw when neither blue nor red triggered
    if (markIndex === -1) {
      const greenIdx = player.hand.findIndex((c, i) => i !== chosen.idx && c.color === 'green');
      if (greenIdx !== -1) markIndex = greenIdx;
    }

    return { cardIndex: chosen.idx, markIndex, prob: chosen.prob, card: chosen.card };
  }

  function netRetreat(playerIndex) {
    if (canDiscardForPosition !== playerIndex) return;
    const player   = players[playerIndex];
    const opponent = players[1 - playerIndex];
    if (player.position !== 'Net' || player.hand.length === 0) return;

    const target = (opponent.position === 'BR' || opponent.position === 'BL') ? opponent.position : 'BR';

    let discardIdx = player.hand.findIndex(c => c.overhead);
    if (discardIdx === -1) discardIdx = player.hand.findIndex(c => c.color === 'green');
    if (discardIdx === -1) {
      let lowestProb = Infinity;
      player.hand.forEach((c, i) => {
        const p = calcProbability(player, c, incomingPower, incomingSpin, incomingCard, pendingPowershotBonus);
        if (p < lowestProb) { lowestProb = p; discardIdx = i; }
      });
    }
    if (discardIdx !== -1) discardForPosition(playerIndex, discardIdx, target);
  }

  function playTurn(playerIndex) {
    const player = players[playerIndex];

    // Draw up to 5 if below target (log each draw so it is visible)
    while (player.hand.length < DRAW_TARGET) {
      drawCard(player, log);
      markedCardIndices[playerIndex] = -1;
      log(`${player.name} (AI v2) draws a card (${player.hand.length}/${DRAW_TARGET})`);
    }
    render(players, currentPlayer, gameLog);

    const decision = selectPlay(playerIndex);
    if (!decision) {
      log(`${player.name} (AI v2) has no playable cards — point lost!`);
      endPoint(1 - playerIndex);
      return;
    }

    if (decision.markIndex !== -1) markCardForDiscard(playerIndex, decision.markIndex, true);

    log(`${player.name} (AI v2) → <strong>${decision.card.name}</strong> (${(decision.prob * 100).toFixed(0)}% success)`);
    playCard(playerIndex, decision.cardIndex);
    netRetreat(playerIndex);
  }

  return { DRAW_TARGET, calcProbability, selectPlay, netRetreat, playTurn };
})();
