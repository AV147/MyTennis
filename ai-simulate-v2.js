// ===== SIMULATION ENGINE v2 =====
// Mirrors AIv2 logic: draws to 5, red/blue/green discard priority.

const SimAIv2 = (() => {

  const DRAW_TARGET = HAND_SIZE; // draw to 5

  function selectCard(player, opponent, incPower, incSpin, incCard, powershotBonus, serveAttempt) {
    const candidates = [];
    player.hand.forEach((card, idx) => {
      if (!simIsCardPlayable(card, player, incPower, incCard)) return;
      const prob = simCalcProb(player, card, incPower, incSpin, incCard, powershotBonus);
      const { oop, difficulty } = simOppDifficulty(card, player, opponent);
      candidates.push({ idx, card, prob, oop, difficulty });
    });
    if (candidates.length === 0) return null;

    // First serve: always pick highest-power serve
    if (incPower === 0 && serveAttempt === 1) {
      const chosen   = candidates.reduce((best, c) => c.card.power > best.card.power ? c : best, candidates[0]);
      const greenIdx = player.hand.findIndex((c, i) => i !== chosen.idx && c.color === 'green');
      return { cardIdx: chosen.idx, card: chosen.card,
               discardIdx: greenIdx, discardColor: greenIdx !== -1 ? 'green' : null };
    }

    candidates.sort((a, b) =>
      a.oop !== b.oop ? (b.oop ? 1 : 0) - (a.oop ? 1 : 0) : b.difficulty - a.difficulty
    );

    let chosen = candidates.find(c => c.prob >= 0.80);
    if (!chosen) chosen = candidates.reduce((best, c) => c.prob > best.prob ? c : best, candidates[0]);

    // ── Discard priority: red → blue → green ──────────────────────────────
    let discardIdx   = -1;
    let discardColor = null;

    if (chosen.prob < 0.80) {
      // BLUE: always discard blue to improve spin (reduce complexity) when below 80%
      const blueIdx = player.hand.findIndex((c, i) => i !== chosen.idx && c.color === 'blue');
      if (blueIdx !== -1) { discardIdx = blueIdx; discardColor = 'blue'; }
    } else {
      // RED: +2 power only if shot stays ≥ 80% after bonus
      const redIdx = player.hand.findIndex((c, i) => i !== chosen.idx && c.color === 'red');
      if (redIdx !== -1) {
        const probWithPower = simCalcProb(player, chosen.card, incPower, incSpin, incCard, powershotBonus, 2, 0);
        if (probWithPower >= 0.80) { discardIdx = redIdx; discardColor = 'red'; }
      }
    }

    // GREEN fallback
    if (discardIdx === -1) {
      const greenIdx = player.hand.findIndex((c, i) => i !== chosen.idx && c.color === 'green');
      if (greenIdx !== -1) { discardIdx = greenIdx; discardColor = 'green'; }
    }

    return { cardIdx: chosen.idx, card: chosen.card, discardIdx, discardColor };
  }

  return { DRAW_TARGET, selectCard };
})();
