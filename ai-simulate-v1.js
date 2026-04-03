// ===== SIMULATION ENGINE v1 =====
// Mirrors AIv1 logic: draws to 5, green-only discard.

const SimAIv1 = (() => {

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

    // Green discard only — free redraw
    const greenIdx = player.hand.findIndex((c, i) => i !== chosen.idx && c.color === 'green');
    return { cardIdx: chosen.idx, card: chosen.card,
             discardIdx: greenIdx, discardColor: greenIdx !== -1 ? 'green' : null };
  }

  return { DRAW_TARGET, selectCard };
})();
